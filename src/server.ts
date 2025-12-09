import { buildApp } from './app.js';
import { config } from './config/index.js';
import { closeDatabase, testConnection } from './db/drizzle.js';
import { logger } from './utils/logger.js';
import { redisClient } from './utils/redis-client.js';

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
			'🚀 Server started successfully',
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
					logger.info('Server closed successfully');
					process.exit(0);
				} catch (error) {
					logger.error({ error }, 'Error during shutdown');
					process.exit(1);
				}
			});
		}
	} catch (error) {
		logger.error({ error }, 'Failed to start server');
		process.exit(1);
	}
}

start();
