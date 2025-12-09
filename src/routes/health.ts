import type { FastifyInstance } from 'fastify';
import { testConnection } from '../db/drizzle.js';
import { redisClient } from '../utils/redis-client.js';
import { success } from '../utils/response.js';

export async function healthRoutes(fastify: FastifyInstance) {
	// 基础健康检查
	fastify.get('/health', async () => {
		return success({
			status: 'ok',
			timestamp: new Date().toISOString(),
		});
	});

	// 详细健康检查（包含依赖服务）
	fastify.get('/health/detailed', async () => {
		const [dbStatus, redisStatus] = await Promise.all([testConnection(), redisClient.ping()]);

		const isHealthy = dbStatus && redisStatus;

		return success({
			status: isHealthy ? 'ok' : 'degraded',
			timestamp: new Date().toISOString(),
			services: {
				database: dbStatus ? 'connected' : 'disconnected',
				redis: redisStatus ? 'connected' : 'disconnected',
			},
		});
	});
}
