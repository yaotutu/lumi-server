/**
 * Worker 启动脚本
 *
 * 用途:
 * - 作为独立进程启动所有 Workers
 * - 处理优雅关闭
 * - 可通过环境变量控制启动哪些 Workers
 *
 * 使用:
 * ```bash
 * node dist/workers/start-workers.js
 * # 或使用 tsx 开发
 * tsx src/workers/start-workers.ts
 * ```
 */

import type { Worker } from 'bullmq';
import { ssePubSubService } from '@/services/sse-pubsub.service';
import { logger } from '@/utils/logger';
import { redisClient } from '@/utils/redis-client';
import { createImageWorker } from './image.worker.js';
import { createModelWorker } from './model.worker.js';
import { startOrphanedFileCleanup } from './orphaned-file-cleanup.worker.js';

const workers: Worker[] = [];
let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * 启动所有 Workers
 */
async function startWorkers() {
	logger.info('========================================');
	logger.info('🚀 正在启动 Workers...');
	logger.info('========================================');

	try {
		// 测试 Redis 连接
		logger.info('步骤 1/4: 测试 Redis 连接...');
		const redisConnected = await redisClient.isReady();
		if (!redisConnected) {
			throw new Error(
				'Redis connection failed - 请检查 Redis 配置（host, port, TLS, cluster mode）',
			);
		}
		logger.info('✅ Redis 连接成功');

		// 初始化 SSE Pub/Sub 服务（Worker 只需要发布功能）
		logger.info('步骤 2/4: 初始化 SSE Pub/Sub 服务...');
		await ssePubSubService.initialize();
		logger.info('✅ SSE Pub/Sub 服务已初始化');

		// 启动 Image Worker
		logger.info('步骤 3/4: 启动 Image Worker...');
		const imageWorker = createImageWorker();
		workers.push(imageWorker);
		logger.info('✅ Image Worker 已启动');

		// 启动 Model Worker
		logger.info('步骤 4/4: 启动 Model Worker...');
		const modelWorker = createModelWorker();
		workers.push(modelWorker);
		logger.info('✅ Model Worker 已启动');

		// 启动孤儿文件清理定时任务
		cleanupTimer = startOrphanedFileCleanup();

		logger.info('========================================');
		logger.info('🎉 所有 Workers 启动成功');
		logger.info({
			workers: ['image-worker', 'model-worker', 'orphaned-file-cleanup'],
		});
		logger.info('========================================');
	} catch (error) {
		logger.error({
			msg: '❌ Workers 启动失败',
			error:
				error instanceof Error
					? {
							message: error.message,
							stack: error.stack,
							name: error.name,
						}
					: error,
		});
		process.exit(1);
	}
}

/**
 * 优雅关闭
 */
async function gracefulShutdown(signal: string) {
	logger.info({ msg: `📥 收到 ${signal} 信号，开始优雅关闭...` });

	try {
		// 停止孤儿文件清理定时任务
		if (cleanupTimer) {
			clearInterval(cleanupTimer);
			logger.info({ msg: '✅ 孤儿文件清理定时任务已停止' });
		}

		// 关闭所有 Workers
		await Promise.all(workers.map((worker) => worker.close()));
		logger.info({ msg: '✅ 所有 Workers 已关闭' });

		// 关闭 SSE Pub/Sub 服务
		await ssePubSubService.close();
		logger.info({ msg: '✅ SSE Pub/Sub 服务已关闭' });

		// 断开 Redis 连接
		await redisClient.disconnect();
		logger.info({ msg: '✅ Redis 连接已断开' });

		process.exit(0);
	} catch (error) {
		logger.error({ msg: '❌ 优雅关闭失败', error });
		process.exit(1);
	}
}

// 监听进程信号
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 启动 Workers
startWorkers().catch((error) => {
	logger.error({ msg: '❌ Workers 启动异常', error });
	process.exit(1);
});
