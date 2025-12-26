import type { FastifyInstance } from 'fastify';
import {
	deleteModelSchema,
	getUserModelsSchema,
	updateModelSchema,
	updateModelVisibilitySchema,
} from '@/schemas/routes/user-models.schema';
import * as modelService from '@/services/model.service';
import { ForbiddenError, InvalidStateError, NotFoundError, ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { getUserIdFromRequest } from '@/utils/request-auth';
import { fail, success } from '@/utils/response';

/**
 * 模型管理路由
 * 提供用户模型的 CRUD 操作
 */
export async function modelRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/users/models
	 * 获取当前用户的模型列表（需要认证）
	 */
	fastify.get<{
		Querystring: {
			visibility?: 'PUBLIC' | 'PRIVATE';
			sortBy?: 'latest' | 'name' | 'popular';
			limit?: string;
			offset?: string;
		};
	}>('/api/users/models', { schema: getUserModelsSchema }, async (request, reply) => {
		try {
			const userId = getUserIdFromRequest(request);
			const query = request.query;

			const result = await modelService.getUserModelsWithStats(userId, {
				visibility: query.visibility,
				sortBy: query.sortBy || 'latest',
				limit: query.limit ? Number.parseInt(query.limit, 10) : 20,
				offset: query.offset ? Number.parseInt(query.offset, 10) : 0,
			});

			logger.info({
				msg: '✅ 获取用户模型列表成功',
				userId,
				count: result.items.length,
				total: result.total,
			});

			return reply.send(success(result));
		} catch (error) {
			logger.error({
				msg: '获取用户模型列表失败',
				error: error instanceof Error ? error.message : error,
				stack: error instanceof Error ? error.stack : undefined,
			});

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, 'VALIDATION_ERROR'));
			}

			return reply.status(500).send(fail('获取用户模型列表失败', 'INTERNAL_ERROR'));
		}
	});

	/**
	 * PATCH /api/models/:id
	 * 更新模型信息（名称、描述）
	 */
	fastify.patch<{
		Params: { id: string };
		Body: { name?: string; description?: string };
	}>('/api/models/:id', { schema: updateModelSchema }, async (request, reply) => {
		try {
			const { id } = request.params;
			const userId = getUserIdFromRequest(request);
			const body = request.body;

			const model = await modelService.updateModel(id, userId, body);

			logger.info({ msg: '✅ 更新模型信息成功', modelId: id, userId });

			return reply.send(success(model));
		} catch (error) {
			logger.error({
				msg: '更新模型信息失败',
				error,
				modelId: request.params.id,
			});

			if (error instanceof NotFoundError) {
				return reply.status(404).send(fail(error.message, 'NOT_FOUND'));
			}
			if (error instanceof ForbiddenError) {
				return reply.status(403).send(fail(error.message, 'FORBIDDEN'));
			}

			return reply.status(500).send(fail('更新模型信息失败', 'INTERNAL_ERROR'));
		}
	});

	/**
	 * PATCH /api/models/:id/visibility
	 * 修改模型可见性（公开/私有）
	 */
	fastify.patch<{
		Params: { id: string };
		Body: { visibility: 'PUBLIC' | 'PRIVATE' };
	}>(
		'/api/models/:id/visibility',
		{ schema: updateModelVisibilitySchema },
		async (request, reply) => {
			try {
				const { id } = request.params;
				const userId = getUserIdFromRequest(request);
				const { visibility } = request.body;

				const model = await modelService.updateModelVisibility(id, userId, visibility);

				logger.info({
					msg: '✅ 修改模型可见性成功',
					modelId: id,
					visibility,
					userId,
				});

				return reply.send(success(model));
			} catch (error) {
				logger.error({
					msg: '修改模型可见性失败',
					error,
					modelId: request.params.id,
				});

				if (error instanceof NotFoundError) {
					return reply.status(404).send(fail(error.message, 'NOT_FOUND'));
				}
				if (error instanceof ForbiddenError) {
					return reply.status(403).send(fail(error.message, 'FORBIDDEN'));
				}
				if (error instanceof InvalidStateError) {
					return reply.status(400).send(fail(error.message, 'INVALID_STATE'));
				}

				return reply.status(500).send(fail('修改模型可见性失败', 'INTERNAL_ERROR'));
			}
		},
	);

	/**
	 * DELETE /api/models/:id
	 * 删除模型
	 */
	fastify.delete<{ Params: { id: string } }>(
		'/api/models/:id',
		{ schema: deleteModelSchema },
		async (request, reply) => {
			try {
				const { id } = request.params;
				const userId = getUserIdFromRequest(request);

				await modelService.deleteModel(id, userId);

				logger.info({ msg: '✅ 删除模型成功', modelId: id, userId });

				return reply.send(success({ message: '删除成功' }));
			} catch (error) {
				logger.error({
					msg: '删除模型失败',
					error,
					modelId: request.params.id,
				});

				if (error instanceof NotFoundError) {
					return reply.status(404).send(fail(error.message, 'NOT_FOUND'));
				}
				if (error instanceof ForbiddenError) {
					return reply.status(403).send(fail(error.message, 'FORBIDDEN'));
				}

				return reply.status(500).send(fail('删除模型失败', 'INTERNAL_ERROR'));
			}
		},
	);
}
