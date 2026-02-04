/**
 * Routes 统一注册
 */
import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.route.js';
import { devicesRoutes } from './devices.route.js'; // ✅ 新增：设备管理路由
import { galleryModelRoutes } from './gallery-models.route.js';
import { healthRoutes } from './health.route.js';
import { interactionRoutes } from './interactions.route.js';
import { modelRoutes } from './models.route.js';
import { proxyRoutes } from './proxy.route.js';
import { slicesRoutes } from './slices.route.js'; // ✅ 新增：切片路由
import { taskRoutes } from './tasks.route.js';
import { userRoutes } from './user.route.js';
import { workerRoutes } from './workers.route.js';

/**
 * 注册所有路由
 */
export async function routes(fastify: FastifyInstance) {
	// 健康检查路由
	await fastify.register(healthRoutes);

	// 认证路由
	await fastify.register(authRoutes);

	// 用户管理路由
	await fastify.register(userRoutes);

	// 代理路由（图片和模型）
	await fastify.register(proxyRoutes);

	// 业务路由
	await fastify.register(taskRoutes);
	await fastify.register(galleryModelRoutes);
	await fastify.register(interactionRoutes);
	await fastify.register(modelRoutes); // ✅ 新增：模型管理路由
	await fastify.register(slicesRoutes); // ✅ 新增：切片路由
	await fastify.register(devicesRoutes); // ✅ 新增：设备管理路由（包含 /api/printers RESTful API）

	// Worker 状态路由
	await fastify.register(workerRoutes);
}
