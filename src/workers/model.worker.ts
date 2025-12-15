/**
 * Model Worker - 3D 模型生成任务处理器
 *
 * 职责:
 * - 从 model-generation 队列消费任务
 * - 调用 3D 模型生成 Provider 生成模型
 * - 更新 Model 和 ModelGenerationJob 状态
 * - 通过 SSE 实时推送状态更新
 * - 处理失败和重试逻辑
 */

import { config } from '@/config/index.js';
import { createModel3DProvider } from '@/providers/model3d';
import type { ModelJobData } from '@/queues';
import { modelJobRepository, modelRepository } from '@/repositories';
import { sseConnectionManager } from '@/services/sse-connection-manager';
import { logger } from '@/utils/logger';
import { downloadAndUploadModel, downloadAndUploadPreviewImage } from '@/utils/model-storage.js';
import { redisClient } from '@/utils/redis-client';
import { transformToProxyUrl } from '@/utils/url-transformer';
import { type Job, Worker } from 'bullmq';

/**
 * 处理 3D 模型生成任务
 */
async function processModelJob(job: Job<ModelJobData>) {
	const { jobId, modelId, imageUrl, requestId, userId } = job.data;

	logger.info({
		msg: '▶️ 开始处理3D模型生成任务',
		jobId,
		modelId,
		requestId,
		userId,
		attempt: job.attemptsMade + 1,
	});

	try {
		// 更新 Job 状态为 RUNNING
		await modelJobRepository.updateStatus(jobId, 'RUNNING', {
			startedAt: new Date(),
		});

		// 调用 3D 模型生成 Provider
		const modelProvider = createModel3DProvider();
		logger.info({
			msg: '🎨 提交3D模型生成任务',
			provider: modelProvider.getName(),
			imageUrl,
		});

		// 提交 3D 模型生成任务
		const submitResult = await modelProvider.submitModelGenerationJob({ imageUrl });
		const providerJobId = submitResult.jobId;

		logger.info({
			msg: '✅ 3D模型任务已提交',
			providerJobId,
			requestId: submitResult.requestId,
		});

		// 更新 Job 记录,保存 Provider 的 jobId
		await modelJobRepository.update(jobId, {
			progress: 10,
			providerJobId,
			providerName: modelProvider.getName(),
		});

		// ✅ SSE 推送: model:generating
		await sseConnectionManager.broadcast(requestId, 'model:generating', {
			modelId,
			providerJobId,
			imageUrl,
		});

		logger.info({
			msg: '📡 SSE 推送: model:generating',
			requestId,
			modelId,
			providerJobId,
		});

		// 轮询查询任务状态
		let attempts = 0;
		const maxAttempts = 60; // 最多轮询 60 次 (约 10 分钟)
		const pollInterval = 10000; // 每 10 秒查询一次

		while (attempts < maxAttempts) {
			attempts++;

			// 等待指定时间
			await new Promise((resolve) => setTimeout(resolve, pollInterval));

			// 查询任务状态
			const status = await modelProvider.queryModelTaskStatus(providerJobId);

			logger.info({
				msg: '🔍 查询3D模型任务状态',
				providerJobId,
				status: status.status,
				attempt: attempts,
			});

			// 更新进度
			const progress = Math.min(10 + Math.floor((attempts / maxAttempts) * 80), 90);
			await modelJobRepository.updateProgress(jobId, progress);

			// ✅ SSE 推送: model:progress
			await sseConnectionManager.broadcast(requestId, 'model:progress', {
				modelId,
				progress,
			});

			if (status.status === 'DONE') {
				// 任务完成
				const modelFile = status.resultFiles?.[0];
				if (!modelFile?.url) {
					throw new Error('3D模型生成完成,但未返回模型文件 URL');
				}

				logger.info({
					msg: '✅ 3D模型生成成功，准备下载并上传到 S3',
					tencentUrl: modelFile.url,
					format: modelFile.type,
					jobId,
					modelId,
				});

				// ✅ 下载模型并上传到 S3（如果是 ZIP 会自动解压）
				const { objUrl, mtlUrl, textureUrl } = await downloadAndUploadModel(
					modelFile.url,
					modelId,
					modelFile.type?.toLowerCase() || 'obj',
				);

				logger.info({
					msg: '✅ 模型已上传到 S3',
					objUrl,
					mtlUrl,
					textureUrl,
					jobId,
					modelId,
				});

				// ✅ 下载并保存预览图（如果有）
				let previewImageStorageUrl: string | undefined;
				if (modelFile.previewImageUrl) {
					try {
						previewImageStorageUrl = await downloadAndUploadPreviewImage(
							modelFile.previewImageUrl,
							modelId,
						);

						logger.info({
							msg: '✅ 预览图已上传到 S3',
							previewImageStorageUrl,
							jobId,
							modelId,
						});
					} catch (error) {
						logger.warn({
							msg: '⚠️ 预览图下载失败',
							jobId,
							modelId,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}

				// 更新 Model 记录（保存 S3 URL）
				const completedAt = new Date();
				await modelRepository.update(modelId, {
					modelUrl: objUrl, // ✅ 保存 OBJ 文件 URL（S3 URL，不是腾讯云 URL）
					mtlUrl, // ✅ 保存 MTL 材质文件 URL
					textureUrl, // ✅ 保存纹理图片 URL
					previewImageUrl: previewImageStorageUrl,
					format: modelFile.type || 'OBJ',
					completedAt,
				});

				// 更新 Job 状态为 COMPLETED
				await modelJobRepository.updateStatus(jobId, 'COMPLETED', {
					progress: 100,
					completedAt,
				});

				// ✅ SSE 推送: model:completed（推送代理 URL，前端可直接使用）
				await sseConnectionManager.broadcast(requestId, 'model:completed', {
					modelId,
					modelUrl: transformToProxyUrl(objUrl, 'model'), // ✅ 转换为代理 URL
					mtlUrl: transformToProxyUrl(mtlUrl, 'model'), // ✅ 转换为代理 URL
					textureUrl: transformToProxyUrl(textureUrl, 'model'), // ✅ 转换为代理 URL
					previewImageUrl: transformToProxyUrl(previewImageStorageUrl, 'image'), // ✅ 转换为代理 URL
					format: modelFile.type || 'OBJ',
					completedAt,
				});

				logger.info({
					msg: '📡 SSE 推送: model:completed',
					requestId,
					modelId,
					modelUrl: modelFile.url,
				});

				return { success: true, modelUrl: modelFile.url };
			}

			if (status.status === 'FAIL') {
				// 任务失败
				throw new Error(
					`3D模型生成失败: ${status.errorMessage || '未知错误'} (错误码: ${status.errorCode})`,
				);
			}

			// 继续等待 (状态为 WAIT 或 RUN)
		}

		// 超时
		throw new Error(`3D模型生成超时: 超过 ${maxAttempts * pollInterval}ms 未完成`);
	} catch (error) {
		logger.error({
			msg: '❌ 3D模型生成任务失败',
			jobId,
			modelId,
			error,
			attempt: job.attemptsMade + 1,
		});

		const errorMessage = error instanceof Error ? error.message : String(error);

		// 更新 Model 记录
		await modelRepository.update(modelId, {
			failedAt: new Date(),
			errorMessage,
		});

		// ✅ SSE 推送: model:failed
		await sseConnectionManager.broadcast(requestId, 'model:failed', {
			modelId,
			errorMessage,
		});

		logger.info({
			msg: '📡 SSE 推送: model:failed',
			requestId,
			modelId,
			errorMessage,
		});

		// 更新 Job 状态
		const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 3);
		if (isLastAttempt) {
			await modelJobRepository.updateStatus(jobId, 'FAILED', {
				failedAt: new Date(),
				errorMessage: error instanceof Error ? error.message : String(error),
			});
		} else {
			// 标记为 RETRYING
			await modelJobRepository.updateStatus(jobId, 'RETRYING', {
				retryCount: job.attemptsMade + 1,
				errorMessage: error instanceof Error ? error.message : String(error),
			});
		}

		throw error; // 让 BullMQ 处理重试
	}
}

/**
 * 创建并启动 Model Worker
 */
export function createModelWorker() {
	const worker = new Worker<ModelJobData>('model-generation', processModelJob, {
		connection: redisClient.getClient(),
		concurrency: config.queue.modelConcurrency, // 使用配置的并发数 (3D生成更耗时)
		limiter: {
			max: 5, // 每 duration 时间内最多处理 5 个任务
			duration: 60000, // 1 分钟
		},
	});

	// 监听 Worker 事件
	worker.on('completed', (job) => {
		logger.info({
			msg: '✅ 3D模型生成任务完成',
			jobId: job.id,
			modelId: job.data.modelId,
			duration: Date.now() - job.timestamp,
		});
	});

	worker.on('failed', (job, error) => {
		logger.error({
			msg: '❌ 3D模型生成任务最终失败',
			jobId: job?.id,
			modelId: job?.data.modelId,
			error: error.message,
			attempts: job?.attemptsMade,
		});
	});

	worker.on('error', (error) => {
		logger.error({
			msg: '❌ Model Worker 错误',
			error: error.message,
		});
	});

	logger.info({
		msg: '🚀 Model Worker 启动成功',
		concurrency: config.queue.modelConcurrency,
	});

	return worker;
}
