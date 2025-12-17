/**
 * User Routes - 用户管理路由
 *
 * 职责：代理外部用户服务的接口（需要 Bearer Token）
 *
 * 端点:
 * - GET  /api/users/info - 获取当前用户信息
 * - GET  /api/users/:id - 获取指定用户信息
 * - POST /api/users/update - 更新用户信息
 * - POST /api/users/logout - 登出
 * - POST /api/users/modify-password - 修改密码
 */

import type { FastifyInstance } from 'fastify';
import { logger } from '@/utils/logger';
import { success, fail } from '@/utils/response';

const USER_SERVICE_BASE_URL = process.env.USER_SERVICE_URL || 'http://user.ai3d.top';

/**
 * 外部用户服务响应格式
 */
interface UserServiceResponse {
	code: number;
	msg: string;
	data?: unknown;
}

/**
 * 代理请求到外部用户服务的通用函数
 */
async function proxyToUserService(
	authHeader: string,
	method: 'GET' | 'POST',
	path: string,
	body?: unknown,
) {
	const options: RequestInit = {
		method,
		headers: {
			Authorization: authHeader, // 直接透传 Authorization header
			'Content-Type': 'application/json',
		},
	};

	if (body) {
		options.body = JSON.stringify(body);
	}

	const response = await fetch(`${USER_SERVICE_BASE_URL}${path}`, options);

	const data = (await response.json()) as UserServiceResponse;
	return { response, data };
}

/**
 * 注册用户管理路由
 */
export async function userRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/users/info
	 * 获取当前登录用户信息
	 */
	fastify.get('/api/users/info', async (request, reply) => {
		try {
			const authHeader = request.headers.authorization;
			if (!authHeader) {
				return reply.code(401).send(fail('未提供认证凭证', 'UNAUTHENTICATED'));
			}

			const { data } = await proxyToUserService(authHeader, 'GET', '/api/v1.0/info');

			if (data.code === 200) {
				return reply.send(success(data.data));
			}

			return reply.code(data.code || 400).send(fail(data.msg || '获取用户信息失败', 'USER_SERVICE_ERROR'));
		} catch (error) {
			logger.error({ msg: '获取用户信息失败', error });
			return reply.code(500).send(fail('服务器内部错误', 'INTERNAL_ERROR'));
		}
	});

	/**
	 * GET /api/users/:id
	 * 获取指定用户信息
	 */
	fastify.get<{ Params: { id: string } }>('/api/users/:id', async (request, reply) => {
		try {
			const authHeader = request.headers.authorization;
			if (!authHeader) {
				return reply.code(401).send(fail('未提供认证凭证', 'UNAUTHENTICATED'));
			}

			const { id } = request.params;

			const { data } = await proxyToUserService(authHeader, 'GET', `/api/v1.0/${id}`);

			if (data.code === 200) {
				return reply.send(success(data.data));
			}

			return reply.code(data.code || 400).send(fail(data.msg || '获取用户信息失败', 'USER_SERVICE_ERROR'));
		} catch (error) {
			logger.error({ msg: '获取用户信息失败', error });
			return reply.code(500).send(fail('服务器内部错误', 'INTERNAL_ERROR'));
		}
	});

	/**
	 * POST /api/users/update
	 * 更新用户信息
	 */
	fastify.post<{
		Body: {
			id: string;
			nick_name?: string;
			avatar?: string;
			gender?: string;
		};
	}>('/api/users/update', async (request, reply) => {
		try {
			const authHeader = request.headers.authorization;
			if (!authHeader) {
				return reply.code(401).send(fail('未提供认证凭证', 'UNAUTHENTICATED'));
			}

			const { data } = await proxyToUserService(authHeader, 'POST', '/api/v1.0/update', request.body);

			if (data.code === 200) {
				return reply.send(success({ message: data.msg || '更新成功' }));
			}

			return reply.code(data.code || 400).send(fail(data.msg || '更新用户信息失败', 'USER_SERVICE_ERROR'));
		} catch (error) {
			logger.error({ msg: '更新用户信息失败', error });
			return reply.code(500).send(fail('服务器内部错误', 'INTERNAL_ERROR'));
		}
	});

	/**
	 * POST /api/users/logout
	 * 用户登出
	 */
	fastify.post('/api/users/logout', async (request, reply) => {
		try {
			const authHeader = request.headers.authorization;
			if (!authHeader) {
				return reply.code(401).send(fail('未提供认证凭证', 'UNAUTHENTICATED'));
			}

			const { data } = await proxyToUserService(authHeader, 'POST', '/api/v1.0/logout');

			if (data.code === 200) {
				return reply.send(success({ message: data.msg || '登出成功' }));
			}

			return reply.code(data.code || 400).send(fail(data.msg || '登出失败', 'USER_SERVICE_ERROR'));
		} catch (error) {
			logger.error({ msg: '登出失败', error });
			return reply.code(500).send(fail('服务器内部错误', 'INTERNAL_ERROR'));
		}
	});

	/**
	 * POST /api/users/modify-password
	 * 修改密码
	 */
	fastify.post<{
		Body: {
			id: string;
			old_password?: string;
			new_password: string;
			repassword: string;
			random_code: string;
		};
	}>('/api/users/modify-password', async (request, reply) => {
		try {
			const authHeader = request.headers.authorization;
			if (!authHeader) {
				return reply.code(401).send(fail('未提供认证凭证', 'UNAUTHENTICATED'));
			}

			const { data } = await proxyToUserService(
				authHeader,
				'POST',
				'/api/v1.0/modify_password',
				request.body,
			);

			if (data.code === 200) {
				return reply.send(success({ message: data.msg || '修改密码成功' }));
			}

			return reply.code(data.code || 400).send(fail(data.msg || '修改密码失败', 'USER_SERVICE_ERROR'));
		} catch (error) {
			logger.error({ msg: '修改密码失败', error });
			return reply.code(500).send(fail('服务器内部错误', 'INTERNAL_ERROR'));
		}
	});
}

