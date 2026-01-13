/**
 * Tasks 路由 Schema (TypeBox 版本)
 * 对应 /api/tasks 相关端点
 */

import { Type } from '@sinclair/typebox';
import {
	IdParam,
	JSendError,
	JSendFail,
	JSendList,
	JSendSuccess,
	PaginationQuery,
} from '../common';
import {
	CreateTaskInput,
	ImageEntity,
	ModelEntity,
	SelectImageInput,
	TaskEntity,
	TaskWithImages,
} from '../entities';

/**
 * GET /api/tasks - 获取任务列表
 */
export const listTasksSchema = {
	tags: ['任务'],
	summary: '获取任务列表',
	description: '分页获取当前用户的生成任务列表',
	querystring: PaginationQuery,
	response: {
		200: JSendList(TaskWithImages),
		401: JSendFail, // 未认证
		500: JSendError, // 服务器内部错误
	},
} as const;

/**
 * GET /api/tasks/:id - 获取任务详情
 */
export const getTaskSchema = {
	tags: ['任务'],
	summary: '获取任务详情',
	description: '获取指定任务的详细信息，包含关联的图片和模型',
	params: IdParam,
	response: {
		200: JSendSuccess(
			Type.Intersect([
				TaskWithImages,
				Type.Object({
					model: Type.Union([ModelEntity, Type.Null()], {
						description: '关联的 3D 模型（如有）',
					}),
				}),
			]),
		),
	},
} as const;

/**
 * POST /api/tasks - 创建任务
 */
export const createTaskSchema = {
	tags: ['任务'],
	summary: '创建生成任务',
	description: '创建新的图片生成任务',
	body: CreateTaskInput,
	response: {
		201: JSendSuccess(TaskEntity),
	},
} as const;

/**
 * PATCH /api/tasks/:id - 选择图片
 */
export const selectImageSchema = {
	tags: ['任务'],
	summary: '选择图片生成 3D 模型',
	description: '从生成的 4 张图片中选择一张，开始生成 3D 模型',
	params: IdParam,
	body: SelectImageInput,
	response: {
		200: JSendSuccess(
			Type.Object({
				task: TaskEntity,
				model: ModelEntity,
			}),
		),
	},
} as const;

/**
 * DELETE /api/tasks/:id - 删除任务
 */
export const deleteTaskSchema = {
	tags: ['任务'],
	summary: '删除任务',
	description: '删除指定的生成任务及其关联数据',
	params: IdParam,
	response: {
		200: JSendSuccess(Type.Null()),
	},
} as const;

/**
 * POST /api/tasks/:id/print - 提交打印
 */
export const submitPrintSchema = {
	tags: ['任务'],
	summary: '提交 3D 打印',
	description: '将模型提交到打印系统进行切片和打印',
	params: IdParam,
	response: {
		200: JSendSuccess(
			Type.Object({
				sliceTaskId: Type.String({ description: '切片任务 ID' }),
				message: Type.String({ description: '提示信息' }),
			}),
		),
	},
} as const;

/**
 * GET /api/tasks/:id/print-status - 获取打印状态
 */
export const getPrintStatusSchema = {
	tags: ['任务'],
	summary: '获取打印状态',
	description: '查询模型的打印和切片状态',
	params: IdParam,
	response: {
		200: JSendSuccess(
			Type.Object({
				printStatus: Type.String({ description: '打印状态' }),
				sliceTaskId: Type.Union([Type.String(), Type.Null()], {
					description: '切片任务 ID',
				}),
				sliceProgress: Type.Union([Type.Integer({ minimum: 0, maximum: 100 }), Type.Null()], {
					description: '切片进度 (0-100)',
				}),
			}),
		),
	},
} as const;

/**
 * GET /api/tasks/:id/status - 获取任务状态（轮询）
 */
export const getTaskStatusSchema = {
	tags: ['任务'],
	summary: '获取任务状态（轮询）',
	description: '轮询获取任务的最新状态，替代 SSE。支持条件查询（since 参数），仅返回有变更的数据',
	params: IdParam,
	querystring: Type.Object({
		since: Type.Optional(
			Type.String({
				format: 'date-time',
				description: '上次查询的 updatedAt 时间，如果数据未更新则返回 304',
			}),
		),
	}),
	response: {
		200: JSendSuccess(
			Type.Intersect([
				TaskWithImages,
				Type.Object({
					model: Type.Union([ModelEntity, Type.Null()], {
						description: '关联的 3D 模型（如有）',
					}),
				}),
			]),
		),
		304: Type.Object({}, { description: 'Not Modified - 数据未更新' }),
		404: JSendFail,
		500: JSendError,
	},
} as const;

/**
 * GET /api/tasks/:id/events - SSE 事件流
 */
export const taskEventsSchema = {
	tags: ['任务'],
	summary: '任务进度事件流 (SSE)',
	description: '实时推送任务状态变化，包括图片生成和 3D 模型生成进度',
	params: IdParam,
	response: {
		200: Type.Object(
			{
				// SSE 响应是 text/event-stream，不是 JSON
				// 这里定义的是事件数据的格式
			},
			{
				description: 'Server-Sent Events 流',
				headers: Type.Object({
					'content-type': Type.Literal('text/event-stream'),
					'cache-control': Type.Literal('no-cache'),
					connection: Type.Literal('keep-alive'),
				}),
			},
		),
	},
} as const;

/**
 * SSE 事件数据格式 (用于文档说明)
 */
export const SSEEventData = Type.Union(
	[
		// 任务状态更新事件
		Type.Object({
			type: Type.Literal('task_update'),
			data: TaskEntity,
		}),
		// 图片生成进度事件
		Type.Object({
			type: Type.Literal('image_update'),
			data: ImageEntity,
		}),
		// 模型生成进度事件
		Type.Object({
			type: Type.Literal('model_update'),
			data: ModelEntity,
		}),
		// 心跳事件
		Type.Object({
			type: Type.Literal('heartbeat'),
			data: Type.Object({
				timestamp: Type.String({ format: 'date-time' }),
			}),
		}),
		// 错误事件
		Type.Object({
			type: Type.Literal('error'),
			data: Type.Object({
				message: Type.String(),
				code: Type.Optional(Type.String()),
			}),
		}),
	],
	{
		$id: 'SSEEventData',
		description: 'SSE 事件数据格式',
		examples: [
			{
				type: 'task_update',
				data: {
					id: 'task_123',
					status: 'IMAGE_GENERATING',
					phase: 'IMAGE_GENERATION',
				},
			},
		],
	},
);
