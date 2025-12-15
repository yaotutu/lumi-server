/**
 * Auth Routes - 认证路由
 *
 * 端点:
 * - POST /api/auth/send-code - 发送验证码
 * - POST /api/auth/verify-code - 验证码登录
 * - POST /api/auth/logout - 登出
 * - GET /api/auth/me - 获取当前用户信息
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '@/config/index.js';
import { getMeSchema, logoutSchema } from '@/schemas/auth.schema';
import * as AuthService from '@/services/auth.service';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { fail, success } from '@/utils/response';

/**
 * Session Cookie 配置
 */
const COOKIE_NAME = 'auth-session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30天(秒)

/**
 * 注册认证路由
 */
export async function authRoutes(fastify: FastifyInstance) {
	/**
	 * POST /api/auth/send-code
	 * 发送邮箱验证码
	 */
	fastify.post<{
		Body: {
			email: string;
		};
	}>('/api/auth/send-code', async (request, reply) => {
		try {
			const { email } = request.body;

			if (!email || email.trim().length === 0) {
				throw new ValidationError('邮箱不能为空');
			}

			const result = await AuthService.sendVerificationCode(email.trim().toLowerCase());

			return reply.send(
				success({
					message: '验证码已发送，请查收（开发环境请使用 0000）',
					// 开发环境返回验证码
					...(result.code && { code: result.code }),
				}),
			);
		} catch (error) {
			logger.error({ msg: '发送验证码失败', error });

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message));
			}

			return reply.code(500).send(fail('发送验证码失败'));
		}
	});

	/**
	 * POST /api/auth/verify-code
	 * 验证码登录
	 */
	fastify.post<{
		Body: {
			email: string;
			code: string;
		};
	}>('/api/auth/verify-code', async (request, reply) => {
		try {
			const { email, code } = request.body;

			// 验证参数
			if (!email || email.trim().length === 0) {
				throw new ValidationError('邮箱不能为空');
			}

			if (!code || code.trim().length === 0) {
				throw new ValidationError('验证码不能为空');
			}

			// 验证登录
			const user = await AuthService.verifyCodeAndLogin(email.trim().toLowerCase(), code.trim());

			// 设置 Cookie (HTTP-only, Secure in production)
			// Cookie 值为 JSON 字符串，包含 userId 和 email
			const sessionData = JSON.stringify({
				userId: user.id,
				email: user.email,
			});

			reply.setCookie(COOKIE_NAME, sessionData, {
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: COOKIE_MAX_AGE,
				path: '/',
				domain: config.cookie.domain, // ✅ 跨端口共享 Cookie
			});

			return reply.send(
				success({
					user: {
						id: user.id,
						email: user.email,
						name: user.name,
						avatar: user.avatar,
					},
					message: '登录成功',
				}),
			);
		} catch (error) {
			logger.error({ msg: '验证码登录失败', error });

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message));
			}

			return reply.code(500).send(fail('登录失败'));
		}
	});

	/**
	 * POST /api/auth/logout
	 * 登出
	 */
	fastify.post('/api/auth/logout', { schema: logoutSchema }, async (_request, reply) => {
		try {
			// 清除 Cookie
			reply.clearCookie(COOKIE_NAME, {
				path: '/',
				domain: config.cookie.domain,
			});

			return reply.send(success({ message: '登出成功' }));
		} catch (error) {
			logger.error({ msg: '登出失败', error });
			reply.code(500);
			return reply.send(fail('登出失败'));
		}
	});

	/**
	 * GET /api/auth/me
	 * 获取当前用户信息
	 *
	 * 响应格式：
	 * {
	 *   "status": "success",
	 *   "data": {
	 *     "status": "authenticated" | "unauthenticated" | "expired" | "error",
	 *     "user": User | null
	 *   }
	 * }
	 */
	fastify.get('/api/auth/me', { schema: getMeSchema }, async (request, reply) => {
		try {
			// 从 Cookie 获取会话数据
			const sessionCookie = request.cookies[COOKIE_NAME];

			if (!sessionCookie) {
				return reply.send(
					success({
						status: 'unauthenticated',
						user: null,
					}),
				);
			}

			// 解析 JSON 格式的会话数据
			let userSession: { userId: string; email: string };
			try {
				userSession = JSON.parse(sessionCookie);
			} catch (error) {
				// JSON 解析失败，清除无效 Cookie
				reply.clearCookie(COOKIE_NAME, { path: '/', domain: config.cookie.domain });
				logger.warn({ msg: 'Cookie JSON 解析失败', error });
				return reply.send(
					success({
						status: 'error',
						user: null,
					}),
				);
			}

			// 验证会话数据格式
			if (!userSession.userId || !userSession.email) {
				reply.clearCookie(COOKIE_NAME, { path: '/', domain: config.cookie.domain });
				logger.warn({ msg: 'Cookie 数据格式无效', userSession });
				return reply.send(
					success({
						status: 'error',
						user: null,
					}),
				);
			}

			// 查询用户信息
			const user = await AuthService.getUserById(userSession.userId);

			if (!user) {
				// Cookie 中的用户ID无效,清除 Cookie
				reply.clearCookie(COOKIE_NAME, { path: '/', domain: config.cookie.domain });

				return reply.send(
					success({
						status: 'expired',
						user: null,
					}),
				);
			}

			return reply.send(
				success({
					status: 'authenticated',
					user: {
						id: user.id,
						email: user.email,
						name: user.name,
						avatar: user.avatar,
					},
				}),
			);
		} catch (error) {
			logger.error({ msg: '获取用户信息失败', error });
			return reply.send(
				success({
					status: 'error',
					user: null,
				}),
			);
		}
	});
}

/**
 * 认证中间件 - 从 Cookie 或 Header 获取用户ID
 * 可用于需要认证的路由
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
	// 优先从 Cookie 获取
	let userId = request.cookies[COOKIE_NAME];

	// fallback: 从 Header 获取 (兼容开发/测试)
	if (!userId) {
		userId = request.headers['x-user-id'] as string;
	}

	if (!userId) {
		return reply.status(401).send(fail('未登录'));
	}

	// 验证用户存在
	const user = await AuthService.getUserById(userId);
	if (!user) {
		return reply.status(401).send(fail('用户不存在'));
	}

	// 将用户信息附加到 request (扩展 FastifyRequest 类型)
	Object.assign(request, { user });
}
