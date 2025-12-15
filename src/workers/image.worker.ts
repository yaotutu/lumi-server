/**
 * Image Worker - 图片生成任务处理器
 *
 * 职责:
 * - 从 image-generation 队列消费任务
 * - 调用图片生成 Provider 生成图片
 * - 下载临时图片并上传到 S3（永久存储）
 * - 更新 GeneratedImage 和 ImageGenerationJob 状态
 * - 通过 SSE 实时推送状态更新
 * - 处理失败和重试逻辑
 */

import { type Job, Worker } from 'bullmq';
import { config } from '@/config/index.js';
import { createImageProvider } from '@/providers/image';
import type { ImageJobData } from '@/queues';
import {
	generatedImageRepository,
	generationRequestRepository,
	imageJobRepository,
} from '@/repositories';
import { sseConnectionManager } from '@/services/sse-connection-manager';
import { storageService } from '@/services/storage.service';
import { logger } from '@/utils/logger';
import { redisClient } from '@/utils/redis-client';
import { transformToProxyUrl } from '@/utils/url-transformer';

/**
 * 处理图片生成任务
 */
async function processImageJob(job: Job<ImageJobData>) {
	const { jobId, imageId, prompt, requestId, userId } = job.data;

	logger.info({
		msg: '▶️ 开始处理图片生成任务',
		jobId,
		imageId,
		requestId,
		userId,
		attempt: job.attemptsMade + 1,
	});

	try {
		// ✅ 从数据库查询完整的 Job 和 Image 信息
		const imageJobData = await imageJobRepository.findById(jobId);
		if (!imageJobData) {
			throw new Error(`ImageJob 不存在: ${jobId}`);
		}

		const imageData = await generatedImageRepository.findById(imageId);
		if (!imageData) {
			throw new Error(`GeneratedImage 不存在: ${imageId}`);
		}

		const imageIndex = imageData.index;
		// ✅ 使用数据库中已优化的提示词（如果存在）
		const optimizedPrompt = imageData.imagePrompt || prompt;

		logger.info({
			msg: '✅ 已从数据库查询任务信息',
			jobId,
			imageId,
			imageIndex,
			imageStatus: imageData.imageStatus,
			jobStatus: imageJobData.status,
			hasOptimizedPrompt: !!imageData.imagePrompt,
			originalPrompt: `${prompt.substring(0, 50)}...`,
			optimizedPrompt: `${optimizedPrompt.substring(0, 50)}...`,
		});

		// 更新 Job 状态为 RUNNING
		await imageJobRepository.updateStatus(jobId, 'RUNNING', {
			startedAt: new Date(),
		});

		// 更新 Image 状态为 GENERATING
		await generatedImageRepository.updateStatus(imageId, 'GENERATING');

		// 更新 Request 状态为 IMAGE_GENERATING（如果还是 IMAGE_PENDING）
		const currentRequest = await generationRequestRepository.findById(requestId);
		if (currentRequest && currentRequest.status === 'IMAGE_PENDING') {
			await generationRequestRepository.update(requestId, {
				status: 'IMAGE_GENERATING',
			});
		}

		// ✅ SSE 推送: image:generating
		await sseConnectionManager.broadcast(requestId, 'image:generating', {
			imageId,
			index: imageIndex,
			prompt: optimizedPrompt, // 使用优化后的提示词
		});

		logger.info({
			msg: '📡 SSE 推送: image:generating',
			requestId,
			imageId,
			index: imageIndex,
		});

		// 调用图片生成 Provider
		const imageProvider = createImageProvider();
		logger.info({
			msg: '🎨 调用图片生成服务',
			provider: imageProvider.getName(),
			imageIndex,
			usingOptimizedPrompt: !!imageData.imagePrompt,
			promptPreview: `${optimizedPrompt.substring(0, 100)}...`,
		});

		// ✅ 使用优化后的提示词生成图片
		const imageUrls = await imageProvider.generateImages(optimizedPrompt, 1);
		const temporaryImageUrl = imageUrls[0];

		if (!temporaryImageUrl) {
			throw new Error('图片生成失败: 未返回图片 URL');
		}

		logger.info({
			msg: '✅ 图片生成成功（临时 URL）',
			temporaryImageUrl,
			jobId,
			imageId,
		});

		// ✅ 下载图片并上传到 S3（永久存储）
		logger.info({
			msg: '📥 开始下载并上传图片到 S3',
			temporaryImageUrl,
			requestId,
			imageIndex,
		});

		const s3ImageUrl = await storageService.uploadImageFromUrl(
			temporaryImageUrl,
			requestId,
			imageIndex,
		);

		logger.info({
			msg: '✅ 图片已上传到 S3（永久 URL）',
			s3ImageUrl,
			temporaryImageUrl,
			jobId,
			imageId,
		});

		// 更新 Image 记录（保存 S3 URL）
		const completedAt = new Date();
		await generatedImageRepository.update(imageId, {
			imageUrl: s3ImageUrl, // ✅ 保存 S3 URL（永久有效）
			imageStatus: 'COMPLETED',
			completedAt,
		});

		// ✅ SSE 推送: image:completed（推送代理 URL，前端可直接使用）
		await sseConnectionManager.broadcast(requestId, 'image:completed', {
			imageId,
			index: imageIndex,
			imageUrl: transformToProxyUrl(s3ImageUrl, 'image'), // ✅ 转换为代理 URL
			completedAt,
		});

		logger.info({
			msg: '📡 SSE 推送: image:completed',
			requestId,
			imageId,
			index: imageIndex,
			imageUrl: s3ImageUrl,
		});

		// 更新 Job 状态为 COMPLETED
		await imageJobRepository.updateStatus(jobId, 'COMPLETED', {
			completedAt: new Date(),
		});

		// 检查是否所有图片都生成完成
		const allImages = await generatedImageRepository.findByRequestId(requestId);
		const allCompleted = allImages.every((img) => img.imageStatus === 'COMPLETED');
		const totalImages = allImages.length;

		logger.info({
			msg: '📊 检查图片生成进度',
			requestId,
			completed: allImages.filter((img) => img.imageStatus === 'COMPLETED').length,
			total: totalImages,
			allCompleted,
		});

		// ✅ SSE 推送: task:updated (所有图片完成)
		if (allCompleted && totalImages > 0) {
			await generationRequestRepository.update(requestId, {
				status: 'IMAGE_COMPLETED',
				phase: 'AWAITING_SELECTION',
			});

			await sseConnectionManager.broadcast(requestId, 'task:updated', {
				requestId,
				status: 'IMAGE_COMPLETED',
				phase: 'AWAITING_SELECTION',
			});

			logger.info({
				msg: '📡 SSE 推送: task:updated (所有图片生成完成)',
				requestId,
				totalImages,
			});
		}

		return { success: true, imageUrl: s3ImageUrl };
	} catch (error) {
		logger.error({
			msg: '❌ 图片生成任务失败',
			jobId,
			imageId,
			error,
			attempt: job.attemptsMade + 1,
		});

		// 获取图片索引
		const imageData = await generatedImageRepository.findById(imageId);
		const imageIndex = imageData?.index ?? 0;
		const errorMessage = error instanceof Error ? error.message : String(error);

		// 更新 Image 状态为 FAILED
		await generatedImageRepository.updateStatus(imageId, 'FAILED', {
			failedAt: new Date(),
			errorMessage,
		});

		// ✅ SSE 推送: image:failed
		await sseConnectionManager.broadcast(requestId, 'image:failed', {
			imageId,
			index: imageIndex,
			errorMessage,
		});

		logger.info({
			msg: '📡 SSE 推送: image:failed',
			requestId,
			imageId,
			index: imageIndex,
			errorMessage,
		});

		// 更新 Job 状态
		const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 3);
		if (isLastAttempt) {
			await imageJobRepository.updateStatus(jobId, 'FAILED', {
				failedAt: new Date(),
				errorMessage: error instanceof Error ? error.message : String(error),
			});
		} else {
			// 标记为 RETRYING
			await imageJobRepository.updateStatus(jobId, 'RETRYING', {
				retryCount: job.attemptsMade + 1,
				errorMessage: error instanceof Error ? error.message : String(error),
			});
		}

		throw error; // 让 BullMQ 处理重试
	}
}

/**
 * 创建并启动 Image Worker
 */
export function createImageWorker() {
	const worker = new Worker<ImageJobData>('image-generation', processImageJob, {
		connection: redisClient.getClient(),
		concurrency: config.queue.imageConcurrency, // 使用配置的并发数
		limiter: {
			max: 10, // 每 duration 时间内最多处理 10 个任务
			duration: 60000, // 1 分钟
		},
	});

	// 监听 Worker 事件
	worker.on('completed', (job) => {
		logger.info({
			msg: '✅ 图片生成任务完成',
			jobId: job.id,
			imageId: job.data.imageId,
			duration: Date.now() - job.timestamp,
		});
	});

	worker.on('failed', (job, error) => {
		logger.error({
			msg: '❌ 图片生成任务最终失败',
			jobId: job?.id,
			imageId: job?.data.imageId,
			error: error.message,
			attempts: job?.attemptsMade,
		});
	});

	worker.on('error', (error) => {
		logger.error({
			msg: '❌ Image Worker 错误',
			error: error.message,
		});
	});

	logger.info({
		msg: '🚀 Image Worker 启动成功',
		concurrency: config.queue.imageConcurrency,
	});

	return worker;
}
