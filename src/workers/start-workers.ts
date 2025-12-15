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
import { logger } from '@/utils/logger';
import { redisClient } from '@/utils/redis-client';
import { createImageWorker } from './image.worker.js';
import { createModelWorker } from './model.worker.js';

const workers: Worker[] = [];

/**
 * 启动所有 Workers
 */
async function startWorkers() {
	logger.info({ msg: '🚀 启动 Workers...' });

	try {
		// 测试 Redis 连接
		await redisClient.ping();
		logger.info({ msg: '✅ Redis 连接成功' });

		// 启动 Image Worker
		const imageWorker = createImageWorker();
		workers.push(imageWorker);

		// 启动 Model Worker
		const modelWorker = createModelWorker();
		workers.push(modelWorker);

		logger.info({
			msg: '✅ 所有 Workers 启动成功',
			workers: ['image-worker', 'model-worker'],
		});
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
		console.error('详细错误:', error);
		process.exit(1);
	}
}

/**
 * 优雅关闭
 */
async function gracefulShutdown(signal: string) {
	logger.info({ msg: `📥 收到 ${signal} 信号，开始优雅关闭...` });

	try {
		// 关闭所有 Workers
		await Promise.all(workers.map((worker) => worker.close()));
		logger.info({ msg: '✅ 所有 Workers 已关闭' });

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
