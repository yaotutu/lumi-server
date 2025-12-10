/**
 * Routes 统一注册
 */
import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health';
import { interactionRoutes } from './interactions.route';
import { modelRoutes } from './models.route';
import { requestRoutes } from './requests.route';

/**
 * 注册所有路由
 */
export async function routes(fastify: FastifyInstance) {
	// 健康检查路由
	await fastify.register(healthRoutes);

	// 业务路由
	await fastify.register(requestRoutes);
	await fastify.register(modelRoutes);
	await fastify.register(interactionRoutes);
}
