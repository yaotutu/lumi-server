/**
 * Image Worker - 图片生成任务处理器
 *
 * 职责:
 * - 从 image-generation 队列消费任务
 * - 调用图片生成 Provider 生成图片
 * - 更新 GeneratedImage 和 ImageGenerationJob 状态
 * - 处理失败和重试逻辑
 */

import { createImageProvider } from '@/providers/image';
import type { ImageJobData } from '@/queues';
import { generatedImageRepository, imageJobRepository } from '@/repositories';
import { logger } from '@/utils/logger';
import { redisClient } from '@/utils/redis-client';
import { type Job, Worker } from 'bullmq';

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
		// 更新 Job 状态为 RUNNING
		await imageJobRepository.updateStatus(jobId, 'RUNNING', {
			startedAt: new Date(),
		});

		// 更新 Image 状态为 GENERATING
		await generatedImageRepository.updateStatus(imageId, 'GENERATING');

		// 调用图片生成 Provider
		const imageProvider = createImageProvider();
		logger.info({
			msg: '🎨 调用图片生成服务',
			provider: imageProvider.getName(),
			prompt,
		});

		// 生成单张图片
		const imageUrls = await imageProvider.generateImages(prompt, 1);
		const imageUrl = imageUrls[0];

		if (!imageUrl) {
			throw new Error('图片生成失败: 未返回图片 URL');
		}

		logger.info({
			msg: '✅ 图片生成成功',
			imageUrl,
			jobId,
			imageId,
		});

		// 更新 Image 记录
		await generatedImageRepository.update(imageId, {
			imageUrl,
			imageStatus: 'COMPLETED',
			completedAt: new Date(),
		});

		// 更新 Job 状态为 COMPLETED
		await imageJobRepository.updateStatus(jobId, 'COMPLETED', {
			completedAt: new Date(),
		});

		return { success: true, imageUrl };
	} catch (error) {
		logger.error({
			msg: '❌ 图片生成任务失败',
			jobId,
			imageId,
			error,
			attempt: job.attemptsMade + 1,
		});

		// 更新 Image 状态为 FAILED
		await generatedImageRepository.updateStatus(imageId, 'FAILED', {
			failedAt: new Date(),
			errorMessage: error instanceof Error ? error.message : String(error),
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
		concurrency: 5, // 并发处理 5 个任务
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

	logger.info({ msg: '🚀 Image Worker 启动成功' });

	return worker;
}
