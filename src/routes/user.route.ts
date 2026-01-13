/**
 * User Routes - 用户管理路由
 *
 * 职责：
 * 1. 代理外部用户服务的接口（需要 Bearer Token）
 * 2. 提供用户收藏、点赞、我的模型功能接口
 *
 * 端点:
 * - GET  /api/users/favorites - 获取用户收藏的模型列表（本地实现）
 * - GET  /api/users/likes - 获取用户点赞的模型列表（本地实现）
 * - GET  /api/users/my-models - 获取用户创建的模型列表（本地实现）
 * - GET  /api/users/:id - 获取指定用户信息（代理）
 * - POST /api/users/update - 更新用户信息（代理）
 * - POST /api/users/modify-password - 修改密码（代理）
 *
 * 注意：
 * - GET /api/users/info 已废弃，使用 GET /api/auth/me 替代
 * - POST /api/users/logout 已废弃，使用 POST /api/auth/logout 替代
 */

import type { FastifyInstance } from 'fastify';
import { getUserServiceClient } from '@/clients/user-service.client';
import config from '@/config/index';
import { modelRepository } from '@/repositories';
import {
	getUserByIdSchema,
	getUserFavoritesSchema,
	getUserLikesSchema,
	getUserMyModelsSchema,
	modifyPasswordSchema,
	updateUserSchema,
} from '@/schemas/routes/users.schema';
import * as InteractionService from '@/services/interaction.service';
import { logger } from '@/utils/logger';
import { fail, success } from '@/utils/response';

/**
 * 注册用户管理路由
 */
export async function userRoutes(fastify: FastifyInstance) {
	// 初始化 UserServiceClient
	const userClient = getUserServiceClient({
		baseUrl: config.userService.url,
		timeout: 10000,
	});

	/**
	 * GET /api/users/favorites
	 * 获取用户收藏的模型列表（本地实现）
	 */
	fastify.get(
		'/api/users/favorites',
		{ schema: getUserFavoritesSchema },
		async (request, reply) => {
			try {
				// 从 request.user 获取用户 ID（由认证中间件注入）
				const userId = request.user?.id;
				if (!userId) {
					return reply.code(401).send(fail('请先登录', 'UNAUTHORIZED'));
				}

				// 解析查询参数
				const query = request.query as {
					limit?: string;
					offset?: string;
				};

				const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
				const offset = query.offset ? Number.parseInt(query.offset, 10) : undefined;

				// 调用 Interaction Service 获取收藏的模型列表
				const models = await InteractionService.getUserFavoritedModels(userId, {
					limit,
					offset,
				});

				logger.info({
					msg: '✅ 获取用户收藏列表成功',
					userId,
					modelCount: models.length,
				});

				return reply.send(success(models));
			} catch (error) {
				logger.error({ msg: '获取用户收藏列表失败', error });
				return reply.code(500).send(fail('获取用户收藏列表失败', 'INTERNAL_ERROR'));
			}
		},
	);

	/**
	 * GET /api/users/likes
	 * 获取用户点赞的模型列表（本地实现）
	 */
	fastify.get('/api/users/likes', { schema: getUserLikesSchema }, async (request, reply) => {
		try {
			// 从 request.user 获取用户 ID（由认证中间件注入）
			const userId = request.user?.id;
			if (!userId) {
				return reply.code(401).send(fail('请先登录', 'UNAUTHORIZED'));
			}

			// 解析查询参数
			const query = request.query as {
				limit?: string;
				offset?: string;
			};

			const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
			const offset = query.offset ? Number.parseInt(query.offset, 10) : undefined;

			// 调用 Interaction Service 获取点赞的模型列表
			const models = await InteractionService.getUserLikedModels(userId, {
				limit,
				offset,
			});

			logger.info({
				msg: '✅ 获取用户点赞列表成功',
				userId,
				modelCount: models.length,
			});

			return reply.send(success(models));
		} catch (error) {
			logger.error({ msg: '获取用户点赞列表失败', error });
			return reply.code(500).send(fail('获取用户点赞列表失败', 'INTERNAL_ERROR'));
		}
	});

	/**
	 * GET /api/users/my-models
	 * 获取用户创建的模型列表（本地实现）
	 */
	fastify.get('/api/users/my-models', { schema: getUserMyModelsSchema }, async (request, reply) => {
		try {
			// 从 request.user 获取用户 ID（由认证中间件注入）
			const userId = request.user?.id;
			if (!userId) {
				return reply.code(401).send(fail('请先登录', 'UNAUTHORIZED'));
			}

			// 解析查询参数
			const query = request.query as {
				visibility?: 'PUBLIC' | 'PRIVATE';
				sortBy?: 'latest' | 'name' | 'popular';
				limit?: string;
				offset?: string;
			};

			const limit = query.limit ? Number.parseInt(query.limit, 10) : 20;
			const offset = query.offset ? Number.parseInt(query.offset, 10) : 0;

			// 调用 Model Repository 获取用户创建的模型列表
			const models = await modelRepository.findByUserId(userId, {
				visibility: query.visibility,
				sortBy: query.sortBy || 'latest',
				limit,
				offset,
			});

			logger.info({
				msg: '✅ 获取用户创建的模型列表成功',
				userId,
				modelCount: models.length,
			});

			return reply.send(success(models));
		} catch (error) {
			logger.error({ msg: '获取用户创建的模型列表失败', error });
			return reply.code(500).send(fail('获取用户创建的模型列表失败', 'INTERNAL_ERROR'));
		}
	});

	/**
	 * GET /api/users/:id
	 * 获取指定用户信息（代理到外部用户服务）
	 */
	fastify.get<{ Params: { id: string } }>(
		'/api/users/:id',
		{ schema: getUserByIdSchema },
		async (request, reply) => {
			try {
				const authHeader = request.headers.authorization;
				if (!authHeader) {
					return reply.code(401).send(fail('未提供认证凭证', 'UNAUTHENTICATED'));
				}

				const { id } = request.params;

				// 调用 UserServiceClient 获取指定用户信息
				const response = await userClient.getUserById(id, authHeader);

				if (response.code === 200) {
					return reply.send(success(response.data));
				}

				// 处理错误响应
				return reply
					.code((response.code || 400) as 200 | 400 | 401 | 500)
					.send(fail(response.msg || '获取用户信息失败', 'USER_SERVICE_ERROR'));
			} catch (error) {
				logger.error({ msg: '获取用户信息失败', error });
				return reply.code(500).send(fail('服务器内部错误', 'INTERNAL_ERROR'));
			}
		},
	);

	/**
	 * POST /api/users/update
	 * 更新用户信息（代理到外部用户服务）
	 */
	fastify.post<{
		Body: {
			id: string;
			nick_name?: string;
			avatar?: string;
			gender?: string;
		};
	}>('/api/users/update', { schema: updateUserSchema }, async (request, reply) => {
		try {
			const authHeader = request.headers.authorization;
			if (!authHeader) {
				return reply.code(401).send(fail('未提供认证凭证', 'UNAUTHENTICATED'));
			}

			const { id, nick_name, avatar, gender } = request.body;

			// 调用 UserServiceClient 更新用户信息
			const response = await userClient.updateUser(
				id,
				{
					nick_name,
					avatar,
					gender,
				},
				authHeader,
			);

			if (response.code === 200) {
				return reply.send(success({ message: response.msg || '更新成功' }));
			}

			// 处理错误响应
			return reply
				.code((response.code || 400) as 200 | 400 | 401 | 500)
				.send(fail(response.msg || '更新用户信息失败', 'USER_SERVICE_ERROR'));
		} catch (error) {
			logger.error({ msg: '更新用户信息失败', error });
			return reply.code(500).send(fail('服务器内部错误', 'INTERNAL_ERROR'));
		}
	});

	/**
	 * POST /api/users/modify-password
	 * 修改密码（代理到外部用户服务）
	 */
	fastify.post<{
		Body: {
			id: string;
			old_password?: string;
			new_password: string;
			repassword: string;
			random_code: string;
		};
	}>('/api/users/modify-password', { schema: modifyPasswordSchema }, async (request, reply) => {
		try {
			const authHeader = request.headers.authorization;
			if (!authHeader) {
				return reply.code(401).send(fail('未提供认证凭证', 'UNAUTHENTICATED'));
			}

			const { id, old_password, new_password, repassword, random_code } = request.body;

			// 调用 UserServiceClient 修改密码
			const response = await userClient.modifyPassword(
				id,
				{
					old_password,
					new_password,
					repassword,
					random_code,
				},
				authHeader,
			);

			if (response.code === 200) {
				return reply.send(success({ message: response.msg || '修改密码成功' }));
			}

			// 处理错误响应
			return reply
				.code((response.code || 400) as 200 | 400 | 401 | 500)
				.send(fail(response.msg || '修改密码失败', 'USER_SERVICE_ERROR'));
		} catch (error) {
			logger.error({ msg: '修改密码失败', error });
			return reply.code(500).send(fail('服务器内部错误', 'INTERNAL_ERROR'));
		}
	});
}
