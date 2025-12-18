/**
 * Auth Routes - 认证路由
 *
 * 架构设计（重构后）：
 * - 前端统一通过 lumi-server 调用认证接口
 * - lumi-server 作为网关，代理到外部用户服务
 * - 统一返回 JSend 格式响应
 * - 使用 UserServiceClient 统一封装外部服务调用
 *
 * 端点:
 * - POST /api/auth/send-code - 发送验证码
 * - POST /api/auth/register - 用户注册
 * - POST /api/auth/login - 用户登录
 * - GET /api/auth/me - 获取当前用户信息
 * - POST /api/auth/logout - 退出登录
 */

import type { FastifyInstance } from 'fastify';
import { getUserServiceClient } from '@/clients/user-service.client';
import config from '@/config/index';
import { logger } from '@/utils/logger';
import { fail, success } from '@/utils/response';

/**
 * 注册认证路由
 */
export async function authRoutes(fastify: FastifyInstance) {
	// 初始化 UserServiceClient
	const userClient = getUserServiceClient({
		baseUrl: config.userService.url,
		timeout: 10000,
	});

	/**
	 * POST /api/auth/send-code
	 * 发送邮箱验证码
	 *
	 * 请求体：
	 * {
	 *   "email": "user@example.com",
	 *   "type": "login" | "register" | "modify_password"
	 * }
	 *
	 * 响应格式：
	 * {
	 *   "status": "success",
	 *   "data": null
	 * }
	 */
	fastify.post('/api/auth/send-code', async (request, reply) => {
		try {
			const { email, type } = request.body as {
				email: string;
				type: 'login' | 'register' | 'modify_password';
			};

			// 调用外部用户服务
			const response = await userClient.sendVerifyCode(email, type);

			if (response.code === 200) {
				return reply.send(success(null));
			}

			return reply.send(fail(response.msg || '发送验证码失败'));
		} catch (error) {
			logger.error({ msg: '发送验证码失败', error });
			return reply.send(fail('发送验证码失败'));
		}
	});

	/**
	 * POST /api/auth/register
	 * 用户注册
	 *
	 * 请求体：
	 * {
	 *   "email": "user@example.com",
	 *   "code": "ABC123"
	 * }
	 *
	 * 响应格式：
	 * {
	 *   "status": "success",
	 *   "data": null
	 * }
	 */
	fastify.post('/api/auth/register', async (request, reply) => {
		try {
			const { email, code } = request.body as {
				email: string;
				code: string;
			};

			// 调用外部用户服务
			const response = await userClient.register(email, code);

			if (response.code === 200) {
				return reply.send(success(null));
			}

			return reply.send(fail(response.msg || '注册失败'));
		} catch (error) {
			logger.error({ msg: '用户注册失败', error });
			return reply.send(fail('注册失败'));
		}
	});

	/**
	 * POST /api/auth/login
	 * 用户登录（验证码方式）
	 *
	 * 请求体：
	 * {
	 *   "email": "user@example.com",
	 *   "code": "ABC123"
	 * }
	 *
	 * 响应格式：
	 * {
	 *   "status": "success",
	 *   "data": {
	 *     "token": "Bearer eyJhbGc..."
	 *   }
	 * }
	 */
	fastify.post('/api/auth/login', async (request, reply) => {
		try {
			const { email, code } = request.body as {
				email: string;
				code: string;
			};

			// 调用外部用户服务
			const response = await userClient.login(email, code);

			if (response.code === 200 && response.data) {
				return reply.send(
					success({
						token: response.data,
					}),
				);
			}

			return reply.send(fail(response.msg || '登录失败'));
		} catch (error) {
			logger.error({ msg: '用户登录失败', error });
			return reply.send(fail('登录失败'));
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
	 *     "status": "authenticated" | "unauthenticated" | "error",
	 *     "user": {
	 *       "id": "external_user_id",
	 *       "email": "...",
	 *       "userName": "...",
	 *       "nickName": "...",
	 *       "avatar": "...",
	 *       "gender": "..."
	 *     } | null
	 *   }
	 * }
	 */
	fastify.get('/api/auth/me', async (request, reply) => {
		try {
			// 从 Authorization header 获取 Token
			const authHeader = request.headers.authorization;
			if (!authHeader) {
				return reply.send(
					success({
						status: 'unauthenticated',
						user: null,
					}),
				);
			}

			// 使用 UserServiceClient 获取用户信息
			const response = await userClient.getUserInfo(authHeader);

			if (response.code === 200 && response.data) {
				return reply.send(
					success({
						status: 'authenticated',
						user: {
							id: response.data.user_id,
							email: response.data.email,
							userName: response.data.user_name,
							nickName: response.data.nick_name,
							avatar: response.data.avatar,
							gender: response.data.gender,
						},
					}),
				);
			}

			return reply.send(
				success({
					status: 'unauthenticated',
					user: null,
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

	/**
	 * POST /api/auth/logout
	 * 退出登录
	 *
	 * 响应格式：
	 * {
	 *   "status": "success",
	 *   "data": null
	 * }
	 */
	fastify.post('/api/auth/logout', async (request, reply) => {
		try {
			// 从 Authorization header 获取 Token
			const authHeader = request.headers.authorization;
			if (!authHeader) {
				return reply.send(success(null));
			}

			// 调用外部用户服务退出登录
			const response = await userClient.logout(authHeader);

			if (response.code === 200) {
				return reply.send(success(null));
			}

			// 即使退出失败，也返回成功（本地清除状态即可）
			return reply.send(success(null));
		} catch (error) {
			logger.error({ msg: '退出登录失败', error });
			// 即使出错，也返回成功（本地清除状态即可）
			return reply.send(success(null));
		}
	});
}
