/**
 * 请求认证工具函数
 * 职责：从请求头中读取 middleware 传递的用户信息
 *
 * 架构设计：
 * - Middleware 验证 Cookie 并将用户信息添加到请求头
 * - API 通过此工具函数读取用户信息，无需重复验证
 * - 所有受保护的 API 都已经过 middleware 验证，这里只是读取
 */

import type { FastifyRequest } from 'fastify';

/**
 * 从请求头中获取当前用户 ID
 *
 * **前置条件**：
 * - 必须在受保护的 API 路由中使用
 * - Middleware 已经验证用户身份并设置了 x-user-id 请求头
 *
 * **使用示例**：
 * ```typescript
 * fastify.get('/api/protected', async (request, reply) => {
 *   const userId = getUserIdFromRequest(request);
 *   const tasks = await TaskService.getUserTasks(userId);
 *   return reply.send(success(tasks));
 * });
 * ```
 *
 * @param request - Fastify 请求对象
 * @returns 用户 ID
 * @throws Error 如果请求头中没有 x-user-id（不应该发生，说明配置错误）
 */
export function getUserIdFromRequest(request: FastifyRequest): string {
	const userId = request.headers['x-user-id'] as string;

	if (!userId) {
		// 这种情况不应该发生，说明：
		// 1. 在未受保护的 API 中调用了此函数
		// 2. Middleware 配置错误
		throw new Error('x-user-id header not found. This API must be protected by middleware.');
	}

	return userId;
}

/**
 * 从请求头中获取当前用户邮箱（可选）
 *
 * @param request - Fastify 请求对象
 * @returns 用户邮箱，如果不存在返回 null
 */
export function getUserEmailFromRequest(request: FastifyRequest): string | null {
	const email = request.headers['x-user-email'] as string | undefined;
	return email || null;
}

/**
 * 从请求头中获取完整的用户信息
 *
 * @param request - Fastify 请求对象
 * @returns { userId: string, email: string | null }
 */
export function getUserFromRequest(request: FastifyRequest): {
	userId: string;
	email: string | null;
} {
	return {
		userId: getUserIdFromRequest(request),
		email: getUserEmailFromRequest(request),
	};
}
