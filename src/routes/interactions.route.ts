/**
 * Interaction Routes
 * 用户交互相关的 API 路由 (点赞/收藏)
 *
 * 重要：本文件完全按照 Next.js 项目的接口设计
 * 参考：/Users/yaotutu/Desktop/code/lumi-web-next/app/api/gallery/models/[id]/interactions/route.ts
 */

import { batchInteractionsSchema } from '@/schemas/interaction.schema';
import * as InteractionService from '@/services/interaction.service';
import { logger } from '@/utils/logger';
import { fail, success } from '@/utils/response';
import type { FastifyInstance } from 'fastify';

/**
 * 注册交互路由
 */
export async function interactionRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/gallery/models/:id/interactions
	 * 获取用户对该模型的交互状态
	 *
	 * Next.js 响应格式：
	 * - 未登录：{ isAuthenticated: false, interactions: [] }
	 * - 已登录：{ isAuthenticated: true, interactions: ['LIKE'|'FAVORITE'], isLiked: boolean, isFavorited: boolean }
	 */
	fastify.get<{ Params: { id: string } }>('/api/gallery/models/:id/interactions', async (request, reply) => {
		try {
			const { id: modelId } = request.params;
			const userId = request.headers['x-user-id'] as string;

			// 用户未登录
			if (!userId) {
				return reply.send(
					success({
						isAuthenticated: false,
						interactions: [],
					}),
				);
			}

			// 获取用户对该模型的交互状态
			const status = await InteractionService.getUserInteractionStatus(userId, modelId);

			// 构建 interactions 数组
			const interactions: string[] = [];
			if (status.liked) interactions.push('LIKE');
			if (status.favorited) interactions.push('FAVORITE');

			// JSend success 格式（与 Next.js 一致）
			return reply.send(
				success({
					isAuthenticated: true,
					interactions,
					isLiked: status.liked,
					isFavorited: status.favorited,
				}),
			);
		} catch (error) {
			logger.error({ msg: '获取交互状态失败', error, modelId: request.params.id });
			return reply.code(500).send(fail('获取交互状态失败'));
		}
	});

	/**
	 * POST /api/gallery/models/:id/interactions
	 * 执行点赞/收藏操作（切换状态）
	 *
	 * 请求体：{ type: "LIKE" | "FAVORITE" }
	 *
	 * Next.js 响应格式：
	 * { isInteracted: boolean, type: string, likeCount: number, favoriteCount: number }
	 */
	fastify.post<{
		Params: { id: string };
		Body: { type: 'LIKE' | 'FAVORITE' };
	}>('/api/gallery/models/:id/interactions', async (request, reply) => {
		try {
			const { id: modelId } = request.params;
			const { type } = request.body;
			const userId = (request.headers['x-user-id'] as string) || 'test-user-id';

			// 验证参数
			if (!type || (type !== 'LIKE' && type !== 'FAVORITE')) {
				return reply.status(400).send(fail('type 必须是 LIKE 或 FAVORITE'));
			}

			// 执行交互操作
			let isInteracted: boolean;
			let likeCount: number;
			let favoriteCount: number;

			if (type === 'LIKE') {
				const result = await InteractionService.toggleLike(userId, modelId);
				isInteracted = result.liked;
				likeCount = result.likeCount;
				// 获取最新的 favoriteCount
				const model = await InteractionService.getUserInteractionStatus(userId, modelId);
				const modelData = await import('@/repositories').then((m) => m.modelRepository.findById(modelId));
				favoriteCount = modelData?.favoriteCount || 0;
			} else {
				const result = await InteractionService.toggleFavorite(userId, modelId);
				isInteracted = result.favorited;
				favoriteCount = result.favoriteCount;
				// 获取最新的 likeCount
				const modelData = await import('@/repositories').then((m) => m.modelRepository.findById(modelId));
				likeCount = modelData?.likeCount || 0;
			}

			logger.info({
				msg: '✅ 用户交互操作',
				userId,
				modelId,
				type,
				isInteracted,
				likeCount,
				favoriteCount,
			});

			// JSend success 格式（与 Next.js 一致）
			return reply.send(
				success({
					isInteracted,
					type,
					likeCount,
					favoriteCount,
				}),
			);
		} catch (error) {
			logger.error({ msg: '交互操作失败', error, modelId: request.params.id });

			if (error instanceof Error && error.message.includes('不存在')) {
				return reply.status(404).send(fail(error.message));
			}

			return reply.code(500).send(fail('交互操作失败'));
		}
	});

	/**
	 * POST /api/gallery/models/batch-interactions
	 * 批量获取用户对多个模型的交互状态
	 *
	 * 请求体：{ modelIds: string[] }
	 *
	 * Next.js 响应格式：
	 * - 未登录：{ isAuthenticated: false, interactions: {} }
	 * - 已登录：{ isAuthenticated: true, interactions: { [modelId]: ['LIKE'|'FAVORITE'] } }
	 */
	fastify.post<{
		Body: { modelIds: string[] };
	}>('/api/gallery/models/batch-interactions', { schema: batchInteractionsSchema }, async (request, reply) => {
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

			// JSend success 格式（与 Next.js 一致）
			return reply.send(
				success({
					isAuthenticated: true,
					interactions,
				}),
			);
		} catch (error) {
			logger.error({ msg: '批量查询交互状态失败', error });
			return reply.code(500).send(fail('批量查询交互状态失败'));
		}
	});
}
