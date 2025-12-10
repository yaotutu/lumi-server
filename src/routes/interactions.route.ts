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
	fastify.post<{ Params: { id: string } }>('/api/models/:id/like', async (request, reply) => {
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
	});

	/**
	 * POST /api/models/:id/favorite
	 * 收藏/取消收藏模型
	 */
	fastify.post<{ Params: { id: string } }>('/api/models/:id/favorite', async (request, reply) => {
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
	});

	/**
	 * GET /api/models/:id/interaction-status
	 * 获取用户对模型的交互状态
	 */
	fastify.get<{ Params: { id: string } }>(
		'/api/models/:id/interaction-status',
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
			const { limit = 20, offset = 0 } = request.query as { limit?: number; offset?: number };

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
			const { limit = 20, offset = 0 } = request.query as { limit?: number; offset?: number };

			const models = await InteractionService.getUserFavoritedModels(userId, { limit, offset });

			return reply.send(success(models));
		} catch (error) {
			logger.error({ msg: '获取收藏模型列表失败', error });
			return reply.status(500).send(fail('获取收藏模型列表失败'));
		}
	});
}
