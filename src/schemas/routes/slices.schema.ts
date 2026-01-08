/**
 * Slices 路由 Schema (TypeBox 版本)
 * 对应 /api/slices 相关端点
 */

import { Type } from '@sinclair/typebox';
import { JSendFail, JSendSuccess } from '../common/jsend.schema.js';

/**
 * 切片任务状态枚举
 */
export const SliceTaskStatusEnum = Type.Union(
	[
		Type.Literal('PENDING'),
		Type.Literal('PROCESSING'),
		Type.Literal('COMPLETED'),
		Type.Literal('FAILED'),
	],
	{
		description: '切片任务状态',
	},
);

/**
 * G-code 元数据 Schema
 */
export const GcodeMetadata = Type.Object(
	{
		layer_height: Type.Optional(Type.Number({ description: '层高（毫米）' })),
		print_time: Type.Optional(Type.Number({ description: '预计打印时间（秒）' })),
		filament_used: Type.Optional(Type.Number({ description: '预计耗材用量（克）' })),
	},
	{
		description: 'G-code 元数据',
		additionalProperties: true, // 允许其他字段
	},
);

/**
 * 切片任务响应数据 Schema
 */
export const SliceTaskEntity = Type.Object(
	{
		sliceTaskId: Type.Union([Type.String(), Type.Null()], {
			description: '切片任务 ID（外部服务返回的 ID）',
		}),
		modelId: Type.String({ description: '模型 ID' }),
		sliceStatus: SliceTaskStatusEnum,
		gcodeUrl: Type.Union([Type.String(), Type.Null()], {
			description: 'G-code 文件下载 URL（完成后才有）',
		}),
		gcodeMetadata: Type.Union([GcodeMetadata, Type.Null()], {
			description: 'G-code 元数据（完成后才有）',
		}),
		errorMessage: Type.Optional(
			Type.Union([Type.String(), Type.Null()], {
				description: '错误信息（失败时才有）',
			}),
		),
		updatedAt: Type.String({
			format: 'date-time',
			description: '更新时间',
		}),
	},
	{
		$id: 'SliceTaskEntity',
		description: '切片任务信息',
	},
);

/**
 * POST /api/slices - 创建切片任务
 */
export const createSliceSchema = {
	tags: ['切片'],
	summary: '创建切片任务',
	description: '为指定的 3D 模型创建切片任务（一键切片）',
	body: Type.Object(
		{
			modelId: Type.String({
				minLength: 1,
				description: '3D 模型 ID',
				examples: ['model_abc123'],
			}),
		},
		{
			$id: 'CreateSliceRequest',
			description: '创建切片任务请求',
		},
	),
	response: {
		201: JSendSuccess(
			Type.Object({
				modelId: Type.String({ description: '模型 ID' }),
				sliceTaskId: Type.String({ description: '切片任务 ID（外部服务返回）' }),
				sliceStatus: Type.Literal('PROCESSING', { description: '任务状态（创建后为 PROCESSING）' }),
				message: Type.String({
					description: '提示信息',
					examples: ['切片任务已创建，正在处理中'],
				}),
			}),
		),
		400: JSendFail, // 参数错误、任务已存在等
		403: JSendFail, // 无权访问该模型
		404: JSendFail, // 模型不存在
		502: JSendFail, // 外部服务不可用
		500: JSendFail, // 服务器错误
	},
} as const;

/**
 * GET /api/slices/:sliceTaskId - 查询切片任务状态
 */
export const getSliceStatusSchema = {
	tags: ['切片'],
	summary: '查询切片任务状态',
	description: '根据切片任务 ID 查询任务状态和结果',
	params: Type.Object({
		sliceTaskId: Type.String({
			minLength: 1,
			description: '切片任务 ID（外部服务返回的 ID）',
		}),
	}),
	response: {
		200: JSendSuccess(SliceTaskEntity),
		404: JSendFail, // 任务不存在
		502: JSendFail, // 外部服务错误
		500: JSendFail, // 服务器错误
	},
} as const;
