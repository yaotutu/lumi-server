/**
 * Fastify 认证中间件（改造为 Bearer Token 验证）
 *
 * 职责：验证用户身份，并通过 request.user 对象传递用户信息
 *
 * 架构设计：
 * - 从 Authorization Header 获取 Bearer Token
 * - 调用外部用户服务验证 Token
 * - 查找或创建本地用户映射
 * - 通过 request.user 对象传递用户信息给路由处理器
 * - 认证失败时，返回 401 + JSend 错误格式
 *
 * 使用方式：
 * - 在 app.ts 中使用 fastify.addHook('onRequest', authMiddleware)
 * - 基于 API_ROUTES 配置自动判断是否需要认证
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { isProtectedRoute } from '@/config/api-routes';
import * as externalUserService from '@/services/external-user.service';
import { logger } from '@/utils/logger';

/**
 * Fastify 认证中间件
 *
 * 在每个请求前自动执行，根据路径和方法判断是否需要认证
 *
 * @param request - Fastify 请求对象
 * @param reply - Fastify 响应对象
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
	const { url, method } = request;

	// 提取路径（去掉查询参数）
	const pathname = url.split('?')[0];

	// 只拦截 /api/* 路由
	if (!pathname.startsWith('/api/')) {
		return;
	}

	// 从 Header 获取 Bearer Token（无论是否需要认证，都尝试解析）
	const authHeader = request.headers.authorization;

	// 如果有 Token，尝试验证并填充 request.user（可选认证）
	if (authHeader && authHeader.startsWith('Bearer ')) {
		const externalUser = await externalUserService.verifyTokenAndGetUser(authHeader);

		if (externalUser) {
			// ✅ Token 有效，填充 request.user
			request.user = {
				id: externalUser.user_id,
				email: externalUser.email,
				userName: externalUser.user_name,
			};

			logger.debug({
				msg: '✅ 认证通过（可选认证）',
				pathname,
				method,
				externalUserId: externalUser.user_id,
			});
		}
	}

	// 检查是否是必须认证的 API（根据路径和方法）
	if (!isProtectedRoute(pathname, method)) {
		// 不需要认证，直接放行（request.user 可能有值，也可能为 undefined）
		return;
	}

	// 需要认证但未提供 Token，或 Token 无效
	if (!request.user) {
		logger.warn({
			msg: '未提供 Token 或 Token 无效',
			pathname,
			method,
		});

		return reply.status(401).send({
			status: 'fail',
			data: {
				message: '请先登录',
				code: 'UNAUTHORIZED',
			},
		});
	}

	// ✅ 需要认证且已认证通过
	logger.debug({
		msg: '✅ 认证通过（强制认证）',
		pathname,
		method,
		userId: request.user.id,
	});
}
