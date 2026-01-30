/**
 * User Routes - 用户管理路由
 *
 * 职责：
 * - Router 层只做参数提取和 Service 调用
 * - 不包含业务逻辑、验证、数据转换
 * - 使用 instanceof 检查错误类型
 * - 统一使用 reply.status() 设置状态码
 *
 * 端点:
 * - GET  /api/users/favorites - 获取用户收藏的模型列表（本地实现）
 * - GET  /api/users/likes - 获取用户点赞的模型列表（本地实现）
 * - GET  /api/users/my-models - 获取用户创建的模型列表（本地实现）
 * - GET  /api/users/:id - 获取指定用户信息（代理）
 * - POST /api/users/update - 更新用户信息（代理）
 * - POST /api/users/modify-password - 修改密码（代理）
 */

import type { FastifyInstance } from 'fastify';
import {
	getUserByIdSchema,
	getUserFavoritesSchema,
	getUserLikesSchema,
	getUserMyModelsSchema,
	modifyPasswordSchema,
	updateUserSchema,
} from '@/schemas/routes/users.schema';
import * as UserService from '@/services/user.service';
import {
	ExternalAPIError,
	NotFoundError,
	UnauthenticatedError,
	ValidationError,
} from '@/utils/errors';
import { logger } from '@/utils/logger';
import { getAuthTokenFromRequest } from '@/utils/request-auth.js';
import { error as errorResponse, fail, success } from '@/utils/response';

/**
 * 注册用户管理路由
 */
export async function userRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/users/favorites
	 * 获取用户收藏的模型列表
	 */
	fastify.get(
		'/api/users/favorites',
		{ schema: getUserFavoritesSchema },
		async (request, reply) => {
			try {
				// ✅ Router 层：仅做参数提取
				const userId = request.user?.id;
				if (!userId) {
					return reply.status(401).send(fail('请先登录', 'UNAUTHORIZED'));
				}

				// 提取查询参数（原始值）
				const query = request.query as {
					limit?: string;
					offset?: string;
				};

				// ✅ 调用 Service 层（参数解析逻辑在 Service 层）
				const models = await UserService.getUserFavoritedModels(userId, {
					limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
					offset: query.offset ? Number.parseInt(query.offset, 10) : undefined,
				});

				logger.info({
					msg: '✅ 获取用户收藏列表成功',
					userId,
					modelCount: models.length,
				});

				return reply.send(success(models));
			} catch (error) {
				logger.error({ msg: '获取用户收藏列表失败', error });

				// ✅ 统一错误处理：使用 instanceof 检查
				if (error instanceof NotFoundError) {
					return reply.status(404).send(fail(error.message, error.code));
				}
				if (error instanceof ValidationError) {
					return reply.status(400).send(fail(error.message, error.code));
				}

				// ✅ 兜底处理
				return reply.status(500).send(errorResponse('获取用户收藏列表失败', 'INTERNAL_ERROR'));
			}
		},
	);

	/**
	 * GET /api/users/likes
	 * 获取用户点赞的模型列表
	 */
	fastify.get('/api/users/likes', { schema: getUserLikesSchema }, async (request, reply) => {
		try {
			// ✅ Router 层：仅做参数提取
			const userId = request.user?.id;
			if (!userId) {
				return reply.status(401).send(fail('请先登录', 'UNAUTHORIZED'));
			}

			// 提取查询参数（原始值）
			const query = request.query as {
				limit?: string;
				offset?: string;
			};

			// ✅ 调用 Service 层
			const models = await UserService.getUserLikedModels(userId, {
				limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
				offset: query.offset ? Number.parseInt(query.offset, 10) : undefined,
			});

			logger.info({
				msg: '✅ 获取用户点赞列表成功',
				userId,
				modelCount: models.length,
			});

			return reply.send(success(models));
		} catch (error) {
			logger.error({ msg: '获取用户点赞列表失败', error });

			// ✅ 统一错误处理
			if (error instanceof NotFoundError) {
				return reply.status(404).send(fail(error.message, error.code));
			}
			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, error.code));
			}

			return reply.status(500).send(errorResponse('获取用户点赞列表失败', 'INTERNAL_ERROR'));
		}
	});

	/**
	 * GET /api/users/my-models
	 * 获取用户创建的模型列表
	 */
	fastify.get('/api/users/my-models', { schema: getUserMyModelsSchema }, async (request, reply) => {
		try {
			// ✅ Router 层：仅做参数提取
			const userId = request.user?.id;
			if (!userId) {
				return reply.status(401).send(fail('请先登录', 'UNAUTHORIZED'));
			}

			// 提取查询参数（原始值）
			const query = request.query as {
				visibility?: 'PUBLIC' | 'PRIVATE';
				sortBy?: 'latest' | 'name' | 'popular';
				limit?: string;
				offset?: string;
			};

			// ✅ 调用 Service 层（默认值设置在 Service 层）
			const models = await UserService.getUserModels(userId, {
				visibility: query.visibility,
				sortBy: query.sortBy,
				limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
				offset: query.offset ? Number.parseInt(query.offset, 10) : undefined,
			});

			logger.info({
				msg: '✅ 获取用户创建的模型列表成功',
				userId,
				modelCount: models.length,
			});

			return reply.send(success(models));
		} catch (error) {
			logger.error({ msg: '获取用户创建的模型列表失败', error });

			// ✅ 统一错误处理
			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, error.code));
			}

			return reply.status(500).send(errorResponse('获取用户创建的模型列表失败', 'INTERNAL_ERROR'));
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
				// ✅ Router 层：仅做参数提取
				const { id } = request.params;

				// ✅ 使用统一工具函数提取 Token
				const authToken = getAuthTokenFromRequest(request);

				// ✅ 调用 Service 层（外部服务调用逻辑在 Service 层）
				const userInfo = await UserService.getUserById(id, authToken);

				return reply.send(success(userInfo));
			} catch (error) {
				logger.error({ msg: '获取用户信息失败', error });

				// ✅ 统一错误处理：使用 instanceof 检查（替代字符串匹配）
				if (error instanceof UnauthenticatedError) {
					return reply.status(401).send(fail(error.message, error.code));
				}
				if (error instanceof NotFoundError) {
					return reply.status(404).send(fail(error.message, error.code));
				}
				if (error instanceof ExternalAPIError) {
					return reply.status(500).send(fail(error.message, error.code));
				}

				return reply.status(500).send(errorResponse('服务器内部错误', 'INTERNAL_ERROR'));
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
			// ✅ Router 层：仅做参数提取
			const { id, nick_name, avatar, gender } = request.body;

			// ✅ 使用统一工具函数提取 Token
			const authToken = getAuthTokenFromRequest(request);

			// ✅ 调用 Service 层
			const result = await UserService.updateUser(
				id,
				{
					nick_name,
					avatar,
					gender,
				},
				authToken,
			);

			return reply.send(success(result));
		} catch (error) {
			logger.error({ msg: '更新用户信息失败', error });

			// ✅ 统一错误处理：使用 instanceof 检查（替代字符串匹配）
			if (error instanceof UnauthenticatedError) {
				return reply.status(401).send(fail(error.message, error.code));
			}
			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, error.code));
			}
			if (error instanceof ExternalAPIError) {
				return reply.status(500).send(fail(error.message, error.code));
			}

			return reply.status(500).send(errorResponse('服务器内部错误', 'INTERNAL_ERROR'));
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
			// ✅ Router 层：仅做参数提取
			const { id, old_password, new_password, repassword, random_code } = request.body;

			// ✅ 使用统一工具函数提取 Token
			const authToken = getAuthTokenFromRequest(request);

			// ✅ 调用 Service 层
			const result = await UserService.modifyPassword(
				id,
				{
					old_password,
					new_password,
					repassword,
					random_code,
				},
				authToken,
			);

			return reply.send(success(result));
		} catch (error) {
			logger.error({ msg: '修改密码失败', error });

			// ✅ 统一错误处理：使用 instanceof 检查（替代字符串匹配）
			if (error instanceof UnauthenticatedError) {
				return reply.status(401).send(fail(error.message, error.code));
			}
			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, error.code));
			}
			if (error instanceof ExternalAPIError) {
				return reply.status(500).send(fail(error.message, error.code));
			}

			return reply.status(500).send(errorResponse('服务器内部错误', 'INTERNAL_ERROR'));
		}
	});
}
