/**
 * User Models 路由 Schema (TypeBox 版本)
 * 对应 /api/users/models 和 /api/models/:id 相关端点
 * 用户自己的模型管理功能
 */

import { Type } from '@sinclair/typebox';
import { IdParam, JSendError, JSendFail, JSendSuccess } from '../common';
import { ModelEntity, ModelVisibilityEnum } from '../entities';

/**
 * GET /api/users/models - 获取当前用户的模型列表
 */
export const getUserModelsSchema = {
	tags: ['模型管理'],
	summary: '获取当前用户的模型列表',
	description: '获取登录用户创建的所有模型，支持按可见性筛选和排序（需要认证）',
	querystring: Type.Object({
		visibility: Type.Optional(ModelVisibilityEnum),
		sortBy: Type.Optional(
			Type.Union([Type.Literal('latest'), Type.Literal('name'), Type.Literal('popular')], {
				default: 'latest',
				description: '排序方式：latest(最新) | name(名称) | popular(热门)',
			}),
		),
		limit: Type.Optional(Type.String({ description: '每页数量（默认 20）' })),
		offset: Type.Optional(Type.String({ description: '偏移量（默认 0）' })),
	}),
	response: {
		200: JSendSuccess(
			Type.Object({
				items: Type.Array(ModelEntity, { description: '模型列表' }),
				total: Type.Integer({ minimum: 0, description: '总数' }),
				publicCount: Type.Integer({ minimum: 0, description: '公开模型数量' }),
				hasMore: Type.Boolean({ description: '是否还有更多数据' }),
			}),
		),
		401: JSendFail, // 未认证
		500: JSendError, // 服务器内部错误
	},
} as const;

/**
 * PATCH /api/models/:id - 更新模型信息
 */
export const updateModelSchema = {
	tags: ['模型管理'],
	summary: '更新模型信息',
	description: '更新模型的名称和描述（需要认证且为模型拥有者）',
	params: IdParam,
	body: Type.Object({
		name: Type.Optional(
			Type.String({
				minLength: 1,
				maxLength: 100,
				description: '模型名称（1-100字符）',
			}),
		),
		description: Type.Optional(
			Type.String({
				maxLength: 500,
				description: '模型描述（最多500字符）',
			}),
		),
	}),
	response: {
		200: JSendSuccess(ModelEntity),
		400: JSendFail, // 参数验证失败
		401: JSendFail, // 未认证
		403: JSendFail, // 无权限（不是模型拥有者）
		404: JSendFail, // 模型不存在
		500: JSendError, // 服务器内部错误
	},
} as const;

/**
 * PATCH /api/models/:id/visibility - 修改模型可见性
 */
export const updateModelVisibilitySchema = {
	tags: ['模型管理'],
	summary: '修改模型可见性',
	description: '将模型设置为公开或私有（需要认证且为模型拥有者）',
	params: IdParam,
	body: Type.Object({
		visibility: ModelVisibilityEnum,
	}),
	response: {
		200: JSendSuccess(ModelEntity),
		400: JSendFail, // 参数验证失败或模型未完成
		401: JSendFail, // 未认证
		403: JSendFail, // 无权限（不是模型拥有者）
		404: JSendFail, // 模型不存在
		500: JSendError, // 服务器内部错误
	},
} as const;

/**
 * DELETE /api/models/:id - 删除模型
 */
export const deleteModelSchema = {
	tags: ['模型管理'],
	summary: '删除模型',
	description: '删除指定的模型（需要认证且为模型拥有者）',
	params: IdParam,
	response: {
		200: JSendSuccess(
			Type.Object({
				message: Type.String({ description: '提示信息' }),
			}),
		),
		401: JSendFail, // 未认证
		403: JSendFail, // 无权限（不是模型拥有者）
		404: JSendFail, // 模型不存在
		500: JSendError, // 服务器内部错误
	},
} as const;
