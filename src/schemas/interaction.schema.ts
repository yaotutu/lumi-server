/**
 * Interaction（交互）相关的 Schema 定义
 */

import { createSuccessResponseSchema } from './common.schema';

/**
 * 交互类型枚举
 */
export const interactionTypeEnum = ['LIKE', 'FAVORITE'] as const;

/**
 * POST /api/gallery/models/batch-interactions - 批量查询交互状态
 */
export const batchInteractionsSchema = {
	tags: ['交互'],
	summary: '批量查询交互状态',
	description: '批量获取用户对多个模型的点赞/收藏状态。未登录时返回空状态。',
	body: {
		type: 'object',
		required: ['modelIds'],
		properties: {
			modelIds: {
				type: 'array',
				items: { type: 'string' },
				minItems: 1,
				maxItems: 50,
				description: '模型 ID 列表（最多 50 个）',
			},
		},
	},
	response: {
		200: createSuccessResponseSchema({
			type: 'object',
			properties: {
				isAuthenticated: { type: 'boolean', description: '用户是否已登录' },
				interactions: {
					type: 'object',
					additionalProperties: {
						type: 'array',
						items: {
							type: 'string',
							enum: interactionTypeEnum,
						},
					},
					description: '交互状态映射 { modelId: ["LIKE", "FAVORITE"] }',
				},
			},
		}),
		400: {
			description: '参数错误（modelIds 为空或超过 50 个）',
		},
	},
} as const;

/**
 * GET /api/me/liked-models - 获取点赞的模型列表
 */
export const getLikedModelsSchema = {
	tags: ['交互'],
	summary: '获取点赞的模型列表',
	description: '获取当前用户点赞的所有模型',
	querystring: {
		type: 'object',
		properties: {
			limit: {
				type: 'integer',
				minimum: 1,
				maximum: 100,
				default: 20,
				description: '每页数量',
			},
			offset: {
				type: 'integer',
				minimum: 0,
				default: 0,
				description: '偏移量',
			},
		},
	},
	response: {
		200: createSuccessResponseSchema({
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					name: { type: 'string' },
					previewImageUrl: { type: 'string' },
					likeCount: { type: 'integer' },
					createdAt: { type: 'string', format: 'date-time' },
				},
			},
		}),
	},
} as const;

/**
 * GET /api/me/favorited-models - 获取收藏的模型列表
 */
export const getFavoritedModelsSchema = {
	tags: ['交互'],
	summary: '获取收藏的模型列表',
	description: '获取当前用户收藏的所有模型',
	querystring: {
		type: 'object',
		properties: {
			limit: {
				type: 'integer',
				minimum: 1,
				maximum: 100,
				default: 20,
				description: '每页数量',
			},
			offset: {
				type: 'integer',
				minimum: 0,
				default: 0,
				description: '偏移量',
			},
		},
	},
	response: {
		200: createSuccessResponseSchema({
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					name: { type: 'string' },
					previewImageUrl: { type: 'string' },
					favoriteCount: { type: 'integer' },
					createdAt: { type: 'string', format: 'date-time' },
				},
			},
		}),
	},
} as const;
