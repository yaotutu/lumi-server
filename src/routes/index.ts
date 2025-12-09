import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';

export async function routes(fastify: FastifyInstance) {
	// 注册健康检查路由
	await fastify.register(healthRoutes);
}
