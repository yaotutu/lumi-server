/**
 * Routes 统一注册
 */
import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.route.js';
import { galleryModelRoutes } from './gallery-models.route.js';
import { healthRoutes } from './health.route.js';
import { interactionRoutes } from './interactions.route.js';
import { taskRoutes } from './tasks.route.js';

/**
 * 注册所有路由
 */
export async function routes(fastify: FastifyInstance) {
	// 健康检查路由
	await fastify.register(healthRoutes);

	// 认证路由
	await fastify.register(authRoutes);

	// 业务路由
	await fastify.register(taskRoutes);
	await fastify.register(galleryModelRoutes);
	await fastify.register(interactionRoutes);
}
