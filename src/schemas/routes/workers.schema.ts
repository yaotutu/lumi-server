/**
 * Workers 路由 Schema (TypeBox 版本)
 * 对应 /api/workers 相关端点（Worker 状态监控）
 */

import { Type } from '@sinclair/typebox';
import { JSendSuccess } from '../common';

/**
 * GET /api/workers/status - 获取 Worker 状态
 */
export const getWorkersStatusSchema = {
	tags: ['Worker'],
	summary: '获取 Worker 状态',
	description: '获取所有 Worker（Image Worker、Model Worker）的运行状态和队列信息',
	response: {
		200: JSendSuccess(
			Type.Object({
				workers: Type.Array(
					Type.Object({
						name: Type.String({ description: 'Worker 名称' }),
						status: Type.Union([
							Type.Literal('running'),
							Type.Literal('stopped'),
							Type.Literal('error'),
						]),
						queueName: Type.String({ description: '队列名称' }),
						concurrency: Type.Integer({ minimum: 1, description: '并发数' }),
						stats: Type.Object({
							active: Type.Integer({ minimum: 0, description: '正在处理的任务数' }),
							waiting: Type.Integer({ minimum: 0, description: '等待中的任务数' }),
							completed: Type.Integer({ minimum: 0, description: '已完成的任务数' }),
							failed: Type.Integer({ minimum: 0, description: '失败的任务数' }),
						}),
					}),
				),
			}),
		),
	},
} as const;
