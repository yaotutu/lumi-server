/**
 * Models 路由 Schema (TypeBox 版本)
 * 对应 /api/gallery/models 相关端点
 */

import { Type } from '@sinclair/typebox';
import { IdParam, JSendFail, JSendList, JSendSuccess, PaginationQuery } from '../common';
import { ModelEntity, ModelSummary } from '../entities';

/**
 * GET /api/gallery/models - 获取模型列表
 */
export const listModelsSchema = {
	tags: ['模型'],
	summary: '获取公开模型列表',
	description: '分页获取所有公开的 3D 模型',
	querystring: Type.Intersect([
		PaginationQuery,
		Type.Object({
			sort: Type.Optional(
				Type.Union([Type.Literal('latest'), Type.Literal('popular'), Type.Literal('liked')], {
					default: 'latest',
					description: '排序方式：latest(最新) | popular(热门) | liked(点赞最多)',
				}),
			),
		}),
	]),
	response: {
		200: JSendList(ModelSummary),
		500: JSendFail, // 服务器内部错误
	},
} as const;

/**
 * GET /api/gallery/models/:id - 获取模型详情
 */
export const getModelSchema = {
	tags: ['模型'],
	summary: '获取模型详情',
	description: '获取指定 3D 模型的详细信息',
	params: IdParam,
	response: {
		200: JSendSuccess(ModelEntity),
	},
} as const;

/**
 * POST /api/gallery/models/:id/download - 下载模型
 */
export const downloadModelSchema = {
	tags: ['模型'],
	summary: '下载模型',
	description: '增加下载计数',
	params: IdParam,
	response: {
		200: JSendSuccess(
			Type.Object({
				message: Type.String({ description: '提示信息' }),
			}),
		),
	},
} as const;
