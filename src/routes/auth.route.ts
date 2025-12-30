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
import {
	getMeSchema,
	loginSchema,
	logoutSchema,
	registerSchema,
	sendCodeSchema,
} from '@/schemas/auth.schema';
import { UserStatsService } from '@/services';
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
	 */
	fastify.post('/api/auth/send-code', { schema: sendCodeSchema }, async (request, reply) => {
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

			// 发送验证码失败，返回 400 状态码
			return reply.status(400).send(fail(response.msg || '发送验证码失败'));
		} catch (error) {
			logger.error({ msg: '发送验证码失败', error });
			// 服务器内部错误，返回 500 状态码
			return reply.status(500).send(fail('发送验证码失败'));
		}
	});

	/**
	 * POST /api/auth/register
	 * 用户注册
	 */
	fastify.post('/api/auth/register', { schema: registerSchema }, async (request, reply) => {
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

			// 注册失败，返回 400 状态码
			return reply.status(400).send(fail(response.msg || '注册失败'));
		} catch (error) {
			logger.error({ msg: '用户注册失败', error });
			// 服务器内部错误，返回 500 状态码
			return reply.status(500).send(fail('注册失败'));
		}
	});

	/**
	 * POST /api/auth/login
	 * 用户登录
	 */
	fastify.post('/api/auth/login', { schema: loginSchema }, async (request, reply) => {
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

			// 登录失败，返回 401 状态码
			return reply.status(401).send(fail(response.msg || '登录失败'));
		} catch (error) {
			logger.error({ msg: '用户登录失败', error });
			// 服务器内部错误，返回 500 状态码
			return reply.status(500).send(fail('登录失败'));
		}
	});

	/**
	 * GET /api/auth/me
	 * 获取当前用户信息（包含统计数据）
	 */
	fastify.get('/api/auth/me', { schema: getMeSchema }, async (request, reply) => {
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
				// 构建 user 对象，只包含必需字段
				const userData: Record<string, any> = {
					id: response.data.user_id,
					userName: response.data.user_name,
					nickName: response.data.nick_name,
				};

				// 添加可选字段（仅在存在时）
				if (response.data.email) {
					userData.email = response.data.email;
				}
				if (response.data.avatar !== undefined) {
					userData.avatar = response.data.avatar || null;
				}
				if (response.data.gender) {
					userData.gender = response.data.gender;
				}

				// 获取用户统计数据
				// 如果统计数据查询失败，使用默认值（全部为 0）
				let stats = null;
				try {
					stats = await UserStatsService.getUserStats(response.data.user_id);
					logger.info({ msg: '✅ 成功获取用户统计数据', userId: response.data.user_id, stats });
				} catch (statsError) {
					// 统计数据查询失败时，记录警告日志，但不影响用户基本信息的返回
					logger.warn({
						msg: '获取用户统计数据失败，使用默认值',
						userId: response.data.user_id,
						error: statsError,
					});
					// 使用默认统计数据（全部为 0）
					stats = {
						totalModels: 0,
						publicModels: 0,
						privateModels: 0,
						totalLikes: 0,
						totalFavorites: 0,
						totalViews: 0,
						totalDownloads: 0,
						likedModelsCount: 0,
						favoritedModelsCount: 0,
						totalRequests: 0,
						completedRequests: 0,
						failedRequests: 0,
					};
				}

				// 将统计数据添加到用户对象中
				userData.stats = stats;

				logger.info({ msg: '📦 准备返回的用户数据', userData });

				return reply.send(
					success({
						status: 'authenticated',
						user: userData,
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
			// 注意：即使出错，也返回 200 状态码 + success 格式
			// 通过 status: 'error' 字段告知前端发生了错误
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
	 */
	fastify.post('/api/auth/logout', { schema: logoutSchema }, async (request, reply) => {
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
