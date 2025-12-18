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

	// 检查是否是需要认证的 API（根据路径和方法）
	if (!isProtectedRoute(pathname, method)) {
		return;
	}

	// 从 Header 获取 Bearer Token
	const authHeader = request.headers.authorization;

	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		logger.warn({
			msg: '未提供 Token',
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

	// 直接使用完整的 Authorization header（包含 "Bearer " 前缀）
	// 调用外部用户服务验证 Token 并获取用户信息
	const externalUser = await externalUserService.verifyTokenAndGetUser(authHeader);

	if (!externalUser) {
		logger.warn({
			msg: 'Token 验证失败',
			pathname,
			method,
		});

		return reply.status(401).send({
			status: 'fail',
			data: {
				message: 'Token 无效或已过期',
				code: 'UNAUTHENTICATED',
			},
		});
	}

	// ✅ 安全：使用 request 对象属性传递用户信息（客户端无法伪造）
	request.user = {
		id: externalUser.user_id,
		email: externalUser.email,
		userName: externalUser.user_name,
	};

	logger.debug({
		msg: '✅ 认证通过',
		pathname,
		method,
		externalUserId: externalUser.user_id,
	});
}
