/**
 * 用户交互相关的 API 路由
 * 处理点赞、收藏等用户交互功能
 */

import type { FastifyInstance } from 'fastify';
import {
	batchInteractionsSchema,
	createInteractionSchema,
	getInteractionsSchema,
} from '@/schemas/routes/interactions.schema';
import * as InteractionService from '@/services/interaction.service';
import { logger } from '@/utils/logger';
import { fail, success } from '@/utils/response';

/**
 * 注册交互路由
 */
export async function interactionRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/gallery/models/:id/interactions
	 * 获取用户对该模型的交互状态
	 *
	 * 响应格式：
	 * - 未登录：{ isAuthenticated: false, interactions: [] }
	 * - 已登录：{ isAuthenticated: true, interactions: ['LIKE'|'FAVORITE'], isLiked: boolean, isFavorited: boolean }
	 */
	fastify.get<{ Params: { id: string } }>(
		'/api/gallery/models/:id/interactions',
		{ schema: getInteractionsSchema },
		async (request, reply) => {
			try {
				const { id: modelId } = request.params;
				const userId = request.user?.id;

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

				// JSend success 格式
				return reply.send(
					success({
						isAuthenticated: true,
						interactions,
						isLiked: status.liked,
						isFavorited: status.favorited,
					}),
				);
			} catch (error) {
				logger.error({
					msg: '获取交互状态失败',
					error,
					modelId: request.params.id,
				});
				return reply.code(500).send(fail('获取交互状态失败'));
			}
		},
	);

	/**
	 * POST /api/gallery/models/:id/interactions
	 * 执行点赞/收藏操作（切换状态）
	 *
	 * 请求体：{ type: "LIKE" | "FAVORITE" }
	 *
	 * 响应格式：
	 * { isInteracted: boolean, type: string, likeCount: number, favoriteCount: number }
	 */
	fastify.post<{
		Params: { id: string };
		Body: { type: 'LIKE' | 'FAVORITE' };
	}>(
		'/api/gallery/models/:id/interactions',
		{ schema: createInteractionSchema },
		async (request, reply) => {
			try {
				const { id: modelId } = request.params;
				const { type } = request.body;
				const userId = request.user?.id;

				if (!userId) {
					return reply.status(401).send({
						status: 'fail',
						data: {
							message: '请先登录',
							code: 'UNAUTHORIZED',
						},
					});
				}

				// 验证参数
				if (!type || (type !== 'LIKE' && type !== 'FAVORITE')) {
					return reply.status(400).send(fail('type 必须是 LIKE 或 FAVORITE'));
				}

				// ✅ 调用 Service 统一处理交互逻辑（已重构到 Service 层）
				const result = await InteractionService.toggleInteraction(userId, modelId, type);

				logger.info({
					msg: '✅ 用户交互操作',
					userId,
					modelId,
					type,
					isInteracted: result.isInteracted,
					likeCount: result.likeCount,
					favoriteCount: result.favoriteCount,
				});

				// JSend success 格式
				return reply.send(success(result));
			} catch (error) {
				logger.error({ msg: '交互操作失败', error, modelId: request.params.id });

				if (error instanceof Error && error.message.includes('不存在')) {
					return reply.status(404).send(fail(error.message));
				}

				return reply.code(500).send(fail('交互操作失败'));
			}
		},
	);

	/**
	 * POST /api/gallery/models/batch-interactions
	 * 批量获取用户对多个模型的交互状态
	 *
	 * 请求体：{ modelIds: string[] }
	 *
	 * 响应格式：
	 * - 未登录：{ isAuthenticated: false, interactions: {} }
	 * - 已登录：{ isAuthenticated: true, interactions: { [modelId]: ['LIKE'|'FAVORITE'] } }
	 */
	fastify.post<{
		Body: { modelIds: string[] };
	}>(
		'/api/gallery/models/batch-interactions',
		{ schema: batchInteractionsSchema },
		async (request, reply) => {
			try {
				const userId = request.user?.id;
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

				// JSend success 格式
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
		},
	);
}
