/**
 * Model Routes
 * 模型管理相关的 API 路由
 */

import { modelQueue } from '@/queues';
import * as ModelService from '@/services/model.service';
import { logger } from '@/utils/logger';
import { fail, success } from '@/utils/response';
import type { FastifyInstance } from 'fastify';

/**
 * 注册模型管理路由
 */
export async function galleryModelRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/gallery/models/me
	 * 获取当前用户的模型列表
	 */
	fastify.get('/api/gallery/models/me', async (request, reply) => {
		try {
			const userId = (request.headers['x-user-id'] as string) || 'test-user-id';
			const query = request.query as { limit?: string; offset?: string };
			const limit = Number.parseInt(query.limit || '20', 10);
			const offset = Number.parseInt(query.offset || '0', 10);

			const models = await ModelService.getUserModels(userId, { limit, offset });

			return reply.send(success(models));
		} catch (error) {
			logger.error({ msg: '获取用户模型列表失败', error });
			return reply.status(500).send(fail('获取用户模型列表失败'));
		}
	});

	/**
	 * GET /api/gallery/models
	 * 获取公开模型列表
	 */
	fastify.get('/api/gallery/models', async (request, reply) => {
		try {
			const query = request.query as {
				sortBy?: string;
				limit?: string;
				offset?: string;
			};

			const sortBy = (query.sortBy || 'latest') as 'latest' | 'popular' | 'liked';
			const limit = Number.parseInt(query.limit || '20', 10);
			const offset = Number.parseInt(query.offset || '0', 10);

			const models = await ModelService.getPublicModels({ sortBy, limit, offset });

			return reply.send(success(models));
		} catch (error) {
			logger.error({ msg: '获取公开模型列表失败', error });
			return reply.status(500).send(fail('获取公开模型列表失败'));
		}
	});

	/**
	 * GET /api/models/:id
	 * 获取模型详情
	 */
	fastify.get<{ Params: { id: string } }>('/api/gallery/models/:id', async (request, reply) => {
		try {
			const { id } = request.params;

			const model = await ModelService.getModelById(id);

			// 增加浏览计数
			await ModelService.incrementViewCount(id);

			return reply.send(success(model));
		} catch (error) {
			logger.error({ msg: '获取模型详情失败', error, modelId: request.params.id });

			if (error instanceof Error && error.message.includes('不存在')) {
				return reply.status(404).send(fail(error.message));
			}

			return reply.status(500).send(fail('获取模型详情失败'));
		}
	});

	/**
	 * POST /api/models
	 * 为生成请求创建 3D 模型
	 */
	fastify.post<{
		Body: {
			requestId: string;
			imageIndex: number;
		};
	}>('/api/gallery/models', async (request, reply) => {
		try {
			const userId = (request.headers['x-user-id'] as string) || 'test-user-id';
			const { requestId, imageIndex } = request.body;

			// 创建模型
			const model = await ModelService.createModelForRequest(requestId, imageIndex);

			// 将 3D 模型生成任务加入队列
			await modelQueue.add(`model-${model.id}`, {
				jobId: model.id, // TODO: 应该使用 ModelJob 的 ID
				modelId: model.id,
				imageUrl: model.previewImageUrl || '',
				requestId,
				userId,
			});

			logger.info({
				msg: '✅ 3D模型创建成功',
				modelId: model.id,
				requestId,
			});

			return reply.status(201).send(
				success({
					model,
					message: '3D模型已创建,生成任务已加入队列',
				}),
			);
		} catch (error) {
			logger.error({ msg: '创建3D模型失败', error });

			if (error instanceof Error && error.message.includes('不存在')) {
				return reply.status(404).send(fail(error.message));
			}

			if (error instanceof Error && error.message.includes('状态')) {
				return reply.status(409).send(fail(error.message));
			}

			if (error instanceof Error && error.message.includes('索引')) {
				return reply.status(400).send(fail(error.message));
			}

			return reply.status(500).send(fail('创建3D模型失败'));
		}
	});

	/**
	 * PATCH /api/models/:id
	 * 更新模型信息
	 */
	fastify.patch<{
		Params: { id: string };
		Body: {
			name?: string;
			description?: string;
		};
	}>('/api/gallery/models/:id', async (request, reply) => {
		try {
			const userId = (request.headers['x-user-id'] as string) || 'test-user-id';
			const { id } = request.params;
			const { name, description } = request.body;

			const model = await ModelService.updateModel(id, userId, { name, description });

			return reply.send(success(model));
		} catch (error) {
			logger.error({ msg: '更新模型失败', error, modelId: request.params.id });

			if (error instanceof Error && error.message.includes('不存在')) {
				return reply.status(404).send(fail(error.message));
			}

			if (error instanceof Error && error.message.includes('无权限')) {
				return reply.status(403).send(fail(error.message));
			}

			return reply.status(500).send(fail('更新模型失败'));
		}
	});

	/**
	 * POST /api/models/:id/publish
	 * 发布模型
	 */
	fastify.post<{ Params: { id: string } }>(
		'/api/gallery/models/:id/publish',
		async (request, reply) => {
			try {
				const userId = (request.headers['x-user-id'] as string) || 'test-user-id';
				const { id } = request.params;

				const model = await ModelService.publishModel(id, userId);

				return reply.send(success(model));
			} catch (error) {
				logger.error({ msg: '发布模型失败', error, modelId: request.params.id });

				if (error instanceof Error && error.message.includes('不存在')) {
					return reply.status(404).send(fail(error.message));
				}

				if (error instanceof Error && error.message.includes('无权限')) {
					return reply.status(403).send(fail(error.message));
				}

				if (error instanceof Error && error.message.includes('状态')) {
					return reply.status(409).send(fail(error.message));
				}

				return reply.status(500).send(fail('发布模型失败'));
			}
		},
	);

	/**
	 * POST /api/models/:id/unpublish
	 * 取消发布模型
	 */
	fastify.post<{ Params: { id: string } }>(
		'/api/gallery/models/:id/unpublish',
		async (request, reply) => {
			try {
				const userId = (request.headers['x-user-id'] as string) || 'test-user-id';
				const { id } = request.params;

				const model = await ModelService.unpublishModel(id, userId);

				return reply.send(success(model));
			} catch (error) {
				logger.error({ msg: '取消发布模型失败', error, modelId: request.params.id });

				if (error instanceof Error && error.message.includes('不存在')) {
					return reply.status(404).send(fail(error.message));
				}

				if (error instanceof Error && error.message.includes('无权限')) {
					return reply.status(403).send(fail(error.message));
				}

				return reply.status(500).send(fail('取消发布模型失败'));
			}
		},
	);

	/**
	 * DELETE /api/models/:id
	 * 删除模型
	 */
	fastify.delete<{ Params: { id: string } }>('/api/gallery/models/:id', async (request, reply) => {
		try {
			const userId = (request.headers['x-user-id'] as string) || 'test-user-id';
			const { id } = request.params;

			await ModelService.deleteModel(id, userId);

			return reply.send(success({ message: '模型已删除' }));
		} catch (error) {
			logger.error({ msg: '删除模型失败', error, modelId: request.params.id });

			if (error instanceof Error && error.message.includes('不存在')) {
				return reply.status(404).send(fail(error.message));
			}

			if (error instanceof Error && error.message.includes('无权限')) {
				return reply.status(403).send(fail(error.message));
			}

			return reply.status(500).send(fail('删除模型失败'));
		}
	});

	/**
	 * POST /api/models/:id/download
	 * 增加下载计数
	 */
	fastify.post<{ Params: { id: string } }>(
		'/api/gallery/models/:id/download',
		async (request, reply) => {
			try {
				const { id } = request.params;

				await ModelService.incrementDownloadCount(id);

				return reply.send(success({ message: '下载计数已增加' }));
			} catch (error) {
				logger.error({ msg: '增加下载计数失败', error, modelId: request.params.id });
				return reply.status(500).send(fail('增加下载计数失败'));
			}
		},
	);
}
