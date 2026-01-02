/**
 * Users 路由 Schema (TypeBox 版本)
 * 对应 /api/users 相关端点（代理外部用户服务）
 *
 * 注意：
 * - GET /api/users/info 已废弃，使用 GET /api/auth/me 替代
 * - POST /api/users/logout 已废弃，使用 POST /api/auth/logout 替代
 */

import { Type } from '@sinclair/typebox';
import { IdParam, JSendFail, JSendSuccess } from '../common';
import { UserEntity } from '../entities';
import { ModelEntity } from '../entities/model.entity.schema';

/**
 * GET /api/users/:id - 获取指定用户信息
 */
export const getUserByIdSchema = {
	tags: ['用户'],
	summary: '获取指定用户信息',
	description: '获取指定 ID 的用户详细信息（需要 Bearer Token）',
	params: IdParam,
	response: {
		200: JSendSuccess(UserEntity),
		400: JSendFail, // 用户服务返回的错误
		401: JSendFail, // 未认证
		404: JSendFail, // 用户不存在
		500: JSendFail, // 服务器内部错误
	},
} as const;

/**
 * POST /api/users/update - 更新用户信息
 */
export const updateUserSchema = {
	tags: ['用户'],
	summary: '更新用户信息',
	description: '更新用户的昵称、头像、性别等信息（需要 Bearer Token）',
	body: Type.Object({
		id: Type.String({ description: '用户 ID' }),
		nick_name: Type.Optional(Type.String({ description: '昵称' })),
		avatar: Type.Optional(Type.String({ format: 'uri', description: '头像 URL' })),
		gender: Type.Optional(Type.String({ description: '性别' })),
	}),
	response: {
		200: JSendSuccess(
			Type.Object({
				message: Type.String({ description: '提示信息' }),
			}),
		),
		401: Type.Object({
			status: Type.Literal('fail'),
			data: Type.Object({
				message: Type.String(),
				code: Type.String(),
			}),
		}),
	},
} as const;

/**
 * POST /api/users/modify-password - 修改密码
 */
export const modifyPasswordSchema = {
	tags: ['用户'],
	summary: '修改密码',
	description: '修改用户登录密码（需要 Bearer Token）',
	body: Type.Object({
		id: Type.String({ description: '用户 ID' }),
		old_password: Type.Optional(Type.String({ description: '旧密码' })),
		new_password: Type.String({ minLength: 6, description: '新密码（最少 6 位）' }),
		repassword: Type.String({ description: '确认新密码' }),
		random_code: Type.String({ description: '验证码' }),
	}),
	response: {
		200: JSendSuccess(
			Type.Object({
				message: Type.String({ description: '提示信息' }),
			}),
		),
		401: Type.Object({
			status: Type.Literal('fail'),
			data: Type.Object({
				message: Type.String(),
				code: Type.String(),
			}),
		}),
	},
} as const;

/**
 * GET /api/users/favorites - 获取用户收藏的模型列表
 */
export const getUserFavoritesSchema = {
	tags: ['用户'],
	summary: '获取用户收藏的模型列表',
	description: '获取当前登录用户收藏的所有 3D 模型（需要 Bearer Token）',
	querystring: Type.Object({
		limit: Type.Optional(Type.String({ description: '每页数量（默认 20）' })),
		offset: Type.Optional(Type.String({ description: '偏移量（默认 0）' })),
	}),
	response: {
		200: JSendSuccess(Type.Array(ModelEntity)),
		401: JSendFail, // 未认证
		500: JSendFail, // 服务器内部错误
	},
} as const;

/**
 * GET /api/users/likes - 获取用户点赞的模型列表
 */
export const getUserLikesSchema = {
	tags: ['用户'],
	summary: '获取用户点赞的模型列表',
	description: '获取当前登录用户点赞的所有 3D 模型（需要 Bearer Token）',
	querystring: Type.Object({
		limit: Type.Optional(Type.String({ description: '每页数量（默认 20）' })),
		offset: Type.Optional(Type.String({ description: '偏移量（默认 0）' })),
	}),
	response: {
		200: JSendSuccess(Type.Array(ModelEntity)),
		401: JSendFail, // 未认证
		500: JSendFail, // 服务器内部错误
	},
} as const;

/**
 * GET /api/users/my-models - 获取用户创建的模型列表
 */
export const getUserMyModelsSchema = {
	tags: ['用户'],
	summary: '获取用户创建的模型列表',
	description: '获取当前登录用户创建的所有 3D 模型（需要 Bearer Token）',
	querystring: Type.Object({
		visibility: Type.Optional(
			Type.Union([Type.Literal('PUBLIC'), Type.Literal('PRIVATE')], {
				description: '可见性筛选（PUBLIC-公开，PRIVATE-私有）',
			}),
		),
		sortBy: Type.Optional(
			Type.Union([Type.Literal('latest'), Type.Literal('name'), Type.Literal('popular')], {
				description: '排序方式（latest-最新，name-名称，popular-最受欢迎）',
			}),
		),
		limit: Type.Optional(Type.String({ description: '每页数量（默认 20）' })),
		offset: Type.Optional(Type.String({ description: '偏移量（默认 0）' })),
	}),
	response: {
		200: JSendSuccess(Type.Array(ModelEntity)),
		401: JSendFail, // 未认证
		500: JSendFail, // 服务器内部错误
	},
} as const;
