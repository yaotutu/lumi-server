/**
 * Health Check Routes
 * 健康检查和系统状态相关的路由
 */

import { db } from '@/db/drizzle';
import { logger } from '@/utils/logger';
import { redisClient } from '@/utils/redis-client';
import { fail, success } from '@/utils/response';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

/**
 * 注册健康检查路由
 */
export async function healthRoutes(fastify: FastifyInstance) {
	/**
	 * GET /health
	 * 基础健康检查
	 */
	fastify.get('/health', async (_request, reply) => {
		return reply.send(
			success({
				status: 'ok',
				timestamp: new Date().toISOString(),
			}),
		);
	});

	/**
	 * GET /health/detailed
	 * 详细健康检查 (数据库 + Redis)
	 */
	fastify.get('/health/detailed', async (_request, reply) => {
		const checks = {
			database: false,
			redis: false,
		};

		try {
			// 检查数据库连接
			await db.execute(sql`SELECT 1`);
			checks.database = true;
		} catch (error) {
			logger.error({ msg: '数据库健康检查失败', error });
		}

		try {
			// 检查 Redis 连接
			await redisClient.ping();
			checks.redis = true;
		} catch (error) {
			logger.error({ msg: 'Redis健康检查失败', error });
		}

		const allHealthy = checks.database && checks.redis;
		const statusCode = allHealthy ? 200 : 503;

		return reply.status(statusCode).send(
			allHealthy
				? success({
						status: 'ok',
						checks,
						timestamp: new Date().toISOString(),
					})
				: fail('部分服务不可用'),
		);
	});

	/**
	 * GET /
	 * 根路径,返回 API 信息
	 */
	fastify.get('/', async (_request, reply) => {
		return reply.send(
			success({
				name: 'Lumi Server API',
				version: '1.0.0',
				description: 'AI 图像和 3D 模型生成服务',
				endpoints: {
					health: '/health',
					requests: '/api/requests',
					models: '/api/models',
					interactions: '/api/models/:id/like',
				},
			}),
		);
	});
}
