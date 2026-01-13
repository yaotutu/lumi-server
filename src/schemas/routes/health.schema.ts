/**
 * Health 路由 Schema (TypeBox 版本)
 * 对应健康检查相关端点
 */

import { Type } from '@sinclair/typebox';
import { JSendFail, JSendSuccess } from '../common';

/**
 * GET /health - 基础健康检查
 */
export const basicHealthSchema = {
	tags: ['健康检查'],
	summary: '基础健康检查',
	description: '检查服务是否正常运行',
	response: {
		200: JSendSuccess(
			Type.Object({
				status: Type.Literal('ok'),
				timestamp: Type.String({ format: 'date-time' }),
			}),
		),
	},
} as const;

/**
 * GET /health/detailed - 详细健康检查
 */
export const detailedHealthSchema = {
	tags: ['健康检查'],
	summary: '详细健康检查',
	description: '检查服务及其依赖（数据库、Redis）的健康状态',
	response: {
		200: JSendSuccess(
			Type.Object({
				status: Type.Literal('ok'),
				checks: Type.Object({
					database: Type.Boolean(),
					redis: Type.Boolean(),
				}),
				timestamp: Type.String({ format: 'date-time' }),
			}),
		),
		503: JSendFail, // 服务不可用
	},
} as const;

/**
 * GET / - 根路径健康检查
 */
export const rootHealthSchema = {
	tags: ['健康检查'],
	summary: '根路径健康检查',
	description: '返回服务基本信息',
	response: {
		200: Type.Object({
			service: Type.String({ description: '服务名称' }),
			version: Type.String({ description: '版本号' }),
			status: Type.Literal('running'),
		}),
	},
} as const;
