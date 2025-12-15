/**
 * Fastify 认证中间件
 *
 * 职责：验证用户身份，并通过请求头传递用户信息
 *
 * 架构设计：
 * - 统一认证拦截（middleware 唯一认证入口）
 * - 验证通过后，通过请求头 (x-user-id) 传递用户信息给路由处理器
 * - 路由处理器直接从请求头读取 userId，无需重复验证
 * - 认证失败时，返回 401 + JSend 错误格式
 *
 * 使用方式：
 * - 在 app.ts 中使用 fastify.addHook('onRequest', authMiddleware)
 * - 基于 API_ROUTES 配置自动判断是否需要认证
 */

import { isProtectedRoute } from '@/config/api-routes';
import { logger } from '@/utils/logger';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Cookie 名称
 */
const AUTH_COOKIE_NAME = 'auth-session';

/**
 * 用户会话数据结构
 */
interface UserSession {
	userId: string;
	email: string;
}

/**
 * 验证结果 - 使用判别联合类型确保类型安全
 */
type AuthResult =
	| {
			isAuthenticated: true;
			userId: string;
			email: string;
	  }
	| {
			isAuthenticated: false;
	  };

/**
 * 验证用户会话并返回用户信息
 *
 * @param request - Fastify 请求对象
 * @returns { isAuthenticated: boolean, userId?: string, email?: string }
 */
function checkAuth(request: FastifyRequest): AuthResult {
	// 从 Cookie 中获取会话信息
	const sessionCookie = request.cookies[AUTH_COOKIE_NAME];

	if (!sessionCookie) {
		return { isAuthenticated: false };
	}

	try {
		// 验证 JSON 格式
		const userSession: UserSession = JSON.parse(sessionCookie);

		// 验证必需字段
		if (userSession.userId && userSession.email) {
			return {
				isAuthenticated: true,
				userId: userSession.userId,
				email: userSession.email,
			};
		}

		return { isAuthenticated: false };
	} catch (_error) {
		// JSON 解析失败或格式错误
		return { isAuthenticated: false };
	}
}

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

	// 调试日志：查看请求的 Cookie
	logger.info({
		msg: '认证中间件检查',
		pathname,
		method,
		cookies: request.cookies,
		hasAuthCookie: !!request.cookies[AUTH_COOKIE_NAME],
		cookieValue: request.cookies[AUTH_COOKIE_NAME],
	});

	// 验证用户登录状态并获取用户信息
	const authResult = checkAuth(request);

	if (!authResult.isAuthenticated) {
		// 用户未登录，返回 401 + JSend 错误格式
		logger.warn({
			msg: '未认证访问受保护的 API',
			pathname,
			method,
			cookieValue: request.cookies[AUTH_COOKIE_NAME],
		});

		return reply.status(401).send({
			status: 'fail',
			data: {
				message: '请先登录',
				code: 'UNAUTHORIZED',
			},
		});
	}

	// 已登录，通过请求头传递用户信息给路由处理器
	// 这样路由处理器可以直接读取，无需重复解析 Cookie
	// TypeScript 现在知道 authResult.userId 和 email 一定存在（因为 isAuthenticated 为 true）
	request.headers['x-user-id'] = authResult.userId;
	request.headers['x-user-email'] = authResult.email;

	logger.debug({
		msg: '认证通过',
		pathname,
		method,
		userId: authResult.userId,
	});
}
