/**
 * Interaction Routes
 * 用户交互相关的 API 路由 (点赞/收藏)
 */

import * as InteractionService from '@/services/interaction.service';
import { logger } from '@/utils/logger';
import { fail, success } from '@/utils/response';
import type { FastifyInstance } from 'fastify';

/**
 * 注册交互路由
 */
export async function interactionRoutes(fastify: FastifyInstance) {
	/**
	 * POST /api/models/:id/like
	 * 点赞/取消点赞模型
	 */
	fastify.post<{ Params: { id: string } }>(
		'/api/gallery/models/:id/like',
		async (request, reply) => {
			try {
				const userId = (request.headers['x-user-id'] as string) || 'test-user-id';
				const { id: modelId } = request.params;

				const result = await InteractionService.toggleLike(userId, modelId);

				return reply.send(success(result));
			} catch (error) {
				logger.error({ msg: '点赞操作失败', error, modelId: request.params.id });

				if (error instanceof Error && error.message.includes('不存在')) {
					return reply.status(404).send(fail(error.message));
				}

				return reply.status(500).send(fail('点赞操作失败'));
			}
		},
	);

	/**
	 * POST /api/models/:id/favorite
	 * 收藏/取消收藏模型
	 */
	fastify.post<{ Params: { id: string } }>(
		'/api/gallery/models/:id/favorite',
		async (request, reply) => {
			try {
				const userId = (request.headers['x-user-id'] as string) || 'test-user-id';
				const { id: modelId } = request.params;

				const result = await InteractionService.toggleFavorite(userId, modelId);

				return reply.send(success(result));
			} catch (error) {
				logger.error({ msg: '收藏操作失败', error, modelId: request.params.id });

				if (error instanceof Error && error.message.includes('不存在')) {
					return reply.status(404).send(fail(error.message));
				}

				return reply.status(500).send(fail('收藏操作失败'));
			}
		},
	);

	/**
	 * GET /api/models/:id/interaction-status
	 * 获取用户对模型的交互状态
	 */
	fastify.get<{ Params: { id: string } }>(
		'/api/gallery/models/:id/interaction-status',
		async (request, reply) => {
			try {
				const userId = (request.headers['x-user-id'] as string) || 'test-user-id';
				const { id: modelId } = request.params;

				const status = await InteractionService.getUserInteractionStatus(userId, modelId);

				return reply.send(success(status));
			} catch (error) {
				logger.error({ msg: '获取交互状态失败', error, modelId: request.params.id });
				return reply.status(500).send(fail('获取交互状态失败'));
			}
		},
	);

	/**
	 * GET /api/me/liked-models
	 * 获取用户点赞的模型列表
	 */
	fastify.get('/api/me/liked-models', async (request, reply) => {
		try {
			const userId = (request.headers['x-user-id'] as string) || 'test-user-id';
			const query = request.query as { limit?: string; offset?: string };
			const limit = Number.parseInt(query.limit || '20', 10);
			const offset = Number.parseInt(query.offset || '0', 10);

			const models = await InteractionService.getUserLikedModels(userId, { limit, offset });

			return reply.send(success(models));
		} catch (error) {
			logger.error({ msg: '获取点赞模型列表失败', error });
			return reply.status(500).send(fail('获取点赞模型列表失败'));
		}
	});

	/**
	 * GET /api/me/favorited-models
	 * 获取用户收藏的模型列表
	 */
	fastify.get('/api/me/favorited-models', async (request, reply) => {
		try {
			const userId = (request.headers['x-user-id'] as string) || 'test-user-id';
			const query = request.query as { limit?: string; offset?: string };
			const limit = Number.parseInt(query.limit || '20', 10);
			const offset = Number.parseInt(query.offset || '0', 10);

			const models = await InteractionService.getUserFavoritedModels(userId, { limit, offset });

			return reply.send(success(models));
		} catch (error) {
			logger.error({ msg: '获取收藏模型列表失败', error });
			return reply.status(500).send(fail('获取收藏模型列表失败'));
		}
	});

	/**
	 * POST /api/gallery/models/batch-interactions
	 * 批量获取用户对多个模型的交互状态
	 */
	fastify.post<{
		Body: { modelIds: string[] };
	}>('/api/gallery/models/batch-interactions', async (request, reply) => {
		try {
			const userId = request.headers['x-user-id'] as string;
			const { modelIds } = request.body;

			// 验证参数
			if (!Array.isArray(modelIds)) {
				return reply.status(400).send(fail('modelIds 必须是数组'));
			}

			if (modelIds.length === 0) {
				return reply.status(400).send(fail('modelIds 不能为空'));
			}

			if (modelIds.length > 50) {
				return reply.status(400).send(fail('最多一次查询 50 个模型'));
			}

			// 用户未登录
			if (!userId) {
				return reply.send(
					success({
						isAuthenticated: false,
						interactions: {},
					}),
				);
			}

			// 批量查询交互状态
			const interactions = await InteractionService.getBatchInteractions(userId, modelIds);

			logger.info({
				msg: '✅ 批量查询交互状态',
				userId,
				modelCount: modelIds.length,
				interactionCount: Object.keys(interactions).length,
			});

			return reply.send(
				success({
					isAuthenticated: true,
					interactions,
				}),
			);
		} catch (error) {
			logger.error({ msg: '批量查询交互状态失败', error });
			return reply.status(500).send(fail('批量查询交互状态失败'));
		}
	});
}
