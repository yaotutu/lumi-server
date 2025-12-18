import { buildApp } from './app.js';
import { config } from './config/index.js';
import { closeDatabase, testConnection } from './db/drizzle.js';
import { logger } from './utils/logger.js';
import { redisClient } from './utils/redis-client.js';

/**
 * API Server 启动入口
 *
 * 注意：此进程只运行 API 服务，不运行 Worker
 * Worker 在独立进程中运行（src/workers/start-workers.ts）
 *
 * 开发环境：使用 npm run dev 会同时启动 API 和 Worker
 * 生产环境：分别启动 npm start（API）和 npm run start:workers（Worker）
 */
async function start() {
	try {
		// 测试数据库连接
		const dbConnected = await testConnection();
		if (!dbConnected) {
			throw new Error('Database connection failed');
		}

		// 测试 Redis 连接
		const redisConnected = await redisClient.ping();
		if (!redisConnected) {
			throw new Error('Redis connection failed');
		}

		logger.info('✅ Database and Redis connected successfully');

		// 构建应用
		const app = await buildApp();

		// 启动服务器
		await app.listen({
			port: config.server.port,
			host: config.server.host,
		});

		logger.info(
			{
				port: config.server.port,
				host: config.server.host,
				env: config.env,
			},
			'🚀 API Server started successfully',
		);

		// 优雅关闭
		const signals = ['SIGINT', 'SIGTERM'];
		for (const signal of signals) {
			process.on(signal, async () => {
				logger.info(`Received ${signal}, shutting down gracefully...`);

				try {
					await app.close();
					await redisClient.disconnect();
					await closeDatabase();
					logger.info('API Server closed successfully');
					process.exit(0);
				} catch (error) {
					logger.error({ error }, 'Error during shutdown');
					process.exit(1);
				}
			});
		}
	} catch (error) {
		logger.error(
			{
				error,
				msg: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			},
			'Failed to start API server',
		);
		process.exit(1);
	}
}

start();
