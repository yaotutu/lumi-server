/**
 * User 实体 Schema
 * 外部用户服务返回的用户信息
 */

import { type Static, Type } from '@sinclair/typebox';

/**
 * 外部用户实体 Schema
 * 对应外部用户服务的返回格式
 */
export const UserEntity = Type.Object(
	{
		id: Type.String({ description: '用户 ID' }),
		email: Type.String({ format: 'email', description: '邮箱' }),
		userName: Type.String({ description: '用户名' }),
		nickName: Type.String({ description: '昵称' }),
		avatar: Type.Union([Type.String({ format: 'uri' }), Type.Null()], {
			description: '头像 URL',
		}),
		gender: Type.String({ description: '性别' }),
	},
	{
		$id: 'UserEntity',
		description: '用户实体',
	},
);

/**
 * 用户摘要 Schema (用于关联展示)
 */
export const UserSummary = Type.Object(
	{
		id: Type.String({ description: '用户 ID' }),
		userName: Type.String({ description: '用户名' }),
		avatar: Type.Union([Type.String({ format: 'uri' }), Type.Null()]),
	},
	{
		$id: 'UserSummary',
		description: '用户摘要信息',
	},
);

/**
 * 用户统计数据 Schema
 * 用于 /api/auth/me 接口返回的统计信息
 */
export const UserStatsEntity = Type.Object(
	{
		// 模型统计
		totalModels: Type.Integer({ minimum: 0, description: '总模型数' }),
		publicModels: Type.Integer({ minimum: 0, description: '公开模型数' }),
		privateModels: Type.Integer({ minimum: 0, description: '私有模型数' }),

		// 获得的交互统计（用户模型被他人的互动）
		totalLikes: Type.Integer({ minimum: 0, description: '获得的总点赞数' }),
		totalFavorites: Type.Integer({ minimum: 0, description: '获得的总收藏数' }),
		totalViews: Type.Integer({ minimum: 0, description: '获得的总浏览数' }),
		totalDownloads: Type.Integer({ minimum: 0, description: '总下载数' }),

		// 用户发出的交互
		likedModelsCount: Type.Integer({ minimum: 0, description: '用户点赞的模型数' }),
		favoritedModelsCount: Type.Integer({ minimum: 0, description: '用户收藏的模型数' }),

		// 生成请求统计
		totalRequests: Type.Integer({ minimum: 0, description: '总生成请求数' }),
		completedRequests: Type.Integer({ minimum: 0, description: '已完成的请求数' }),
		failedRequests: Type.Integer({ minimum: 0, description: '失败的请求数' }),
	},
	{
		$id: 'UserStatsEntity',
		description: '用户统计数据',
	},
);

/**
 * 类型推导
 */
export type UserEntityType = Static<typeof UserEntity>;
export type UserSummaryType = Static<typeof UserSummary>;
export type UserStatsType = Static<typeof UserStatsEntity>;
