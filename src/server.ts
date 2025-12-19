import { buildApp } from './app.js';
import { config } from './config/index.js';
import { closeDatabase, testConnection } from './db/drizzle.js';
import { sseConnectionManager } from './services/sse-connection-manager.js';
import { ssePubSubService } from './services/sse-pubsub.service.js';
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
		logger.info('========================================');
		logger.info('🚀 正在启动 API Server...');
		logger.info('========================================');

		// 测试数据库连接
		logger.info('步骤 1/5: 测试数据库连接...');
		const dbConnected = await testConnection();
		if (!dbConnected) {
			throw new Error('Database connection failed');
		}
		logger.info('✅ 数据库连接成功');

		// 测试 Redis 连接
		logger.info('步骤 2/5: 测试 Redis 连接...');
		const redisConnected = await redisClient.isReady();
		if (!redisConnected) {
			throw new Error(
				'Redis connection failed - 请检查 Redis 配置（host, port, TLS, cluster mode）',
			);
		}
		logger.info('✅ Redis 连接成功');

		logger.info('✅ Database and Redis connected successfully');

		// 初始化 SSE Pub/Sub 服务
		logger.info('步骤 3/5: 初始化 SSE Pub/Sub 服务...');
		await ssePubSubService.initialize();
		logger.info('✅ SSE Pub/Sub 服务初始化成功');

		// 订阅 Redis 事件并转发给 SSE 连接
		logger.info('步骤 4/5: 订阅 Redis SSE 事件...');
		await ssePubSubService.subscribe((message) => {
			logger.debug(
				{
					taskId: message.taskId,
					eventType: message.eventType,
				},
				'收到 Redis SSE 事件，转发给本地连接',
			);

			// 推送给本地 SSE 连接
			sseConnectionManager.sendToLocalConnections(message.taskId, message.eventType, message.data);
		});

		logger.info('✅ SSE Pub/Sub service initialized and subscribed');

		// 构建应用
		logger.info('步骤 5/5: 构建 Fastify 应用...');
		const app = await buildApp();
		logger.info('✅ Fastify 应用构建成功');

		// 启动服务器
		logger.info('正在启动 HTTP 服务器...');
		await app.listen({
			port: config.server.port,
			host: config.server.host,
		});

		logger.info('========================================');
		logger.info(
			{
				port: config.server.port,
				host: config.server.host,
				env: config.env,
			},
			'🎉 API Server started successfully',
		);
		logger.info(`📡 服务地址: http://${config.server.host}:${config.server.port}`);
		logger.info(`📚 API 文档: http://${config.server.host}:${config.server.port}/docs`);
		logger.info('========================================');

		// 优雅关闭
		const signals = ['SIGINT', 'SIGTERM'];
		for (const signal of signals) {
			process.on(signal, async () => {
				logger.info(`Received ${signal}, shutting down gracefully...`);

				try {
					await app.close();
					await ssePubSubService.close();
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
