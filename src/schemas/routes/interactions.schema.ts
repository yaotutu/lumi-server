/**
 * Interactions 路由 Schema (TypeBox 版本)
 * 对应 /api/gallery/models/:id/interactions 相关端点
 */

import { Type } from '@sinclair/typebox';
import { IdParam, JSendSuccess } from '../common';
import { CreateInteractionInput, InteractionEntity } from '../entities';

/**
 * GET /api/gallery/models/:id/interactions - 获取用户对模型的交互状态
 */
export const getInteractionsSchema = {
	tags: ['交互'],
	summary: '获取用户交互状态',
	description: '获取当前用户对指定模型的点赞和收藏状态',
	params: IdParam,
	response: {
		200: JSendSuccess(
			Type.Object({
				isAuthenticated: Type.Boolean({
					description: '用户是否已登录',
				}),
				interactions: Type.Array(Type.String(), {
					description: '交互类型数组 (["LIKE"] | ["FAVORITE"] | ["LIKE", "FAVORITE"] | [])',
				}),
				isLiked: Type.Optional(
					Type.Boolean({
						description: '是否已点赞 (仅登录时返回)',
					}),
				),
				isFavorited: Type.Optional(
					Type.Boolean({
						description: '是否已收藏 (仅登录时返回)',
					}),
				),
			}),
		),
	},
} as const;

/**
 * POST /api/gallery/models/:id/interactions - 创建交互
 */
export const createInteractionSchema = {
	tags: ['交互'],
	summary: '创建交互',
	description: '对模型进行点赞或收藏操作',
	params: IdParam,
	body: CreateInteractionInput,
	response: {
		201: JSendSuccess(InteractionEntity),
	},
} as const;

/**
 * 单个模型的交互状态对象
 */
const InteractionStatus = Type.Object({
	isLiked: Type.Boolean({
		description: '是否已点赞',
	}),
	isFavorited: Type.Boolean({
		description: '是否已收藏',
	}),
});

/**
 * POST /api/gallery/models/batch-interactions - 批量获取交互状态
 */
export const batchInteractionsSchema = {
	tags: ['交互'],
	summary: '批量获取交互状态',
	description: '批量获取当前用户对多个模型的交互状态',
	body: Type.Object({
		modelIds: Type.Array(Type.String(), {
			minItems: 1,
			maxItems: 100,
			description: '模型 ID 列表 (1-100 个)',
		}),
	}),
	response: {
		200: JSendSuccess(
			Type.Object({
				isAuthenticated: Type.Boolean({
					description: '用户是否已登录',
				}),
				interactions: Type.Record(Type.String(), InteractionStatus, {
					description: '交互状态映射 { [modelId]: { isLiked: boolean, isFavorited: boolean } }',
				}),
			}),
		),
	},
} as const;
