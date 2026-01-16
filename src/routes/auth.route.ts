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
import { getUserServiceClient } from '@/clients/user';
import config from '@/config/index';
import {
	getMeSchema,
	loginSchema,
	logoutSchema,
	registerSchema,
	sendCodeSchema,
} from '@/schemas/auth.schema';
import * as AuthService from '@/services/auth.service';
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

			// 调用外部用户服务（Client 中间层已处理错误）
			// 返回 { message: string }
			await userClient.sendVerifyCode(email, type);

			return reply.send(success(null));
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

			// 调用外部用户服务（Client 中间层已处理错误）
			// 返回 { message: string }
			await userClient.register(email, code);

			return reply.send(success(null));
		} catch (error) {
			logger.error({ msg: '注册失败', error });
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
			const token = await userClient.login(email, code);

			return reply.send(
				success({
					token,
				}),
			);
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

			// ✅ 调用 Service 获取用户资料（已重构到 Service 层）
			const profile = await AuthService.getUserProfile(authHeader);

			return reply.send(success(profile));
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
			await userClient.logout(authHeader);

			// 退出成功
			return reply.send(success(null));
		} catch (error) {
			logger.error({ msg: '退出登录失败', error });
			// 即使出错，也返回成功（本地清除状态即可）
			return reply.send(success(null));
		}
	});
}
