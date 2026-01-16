/**
 * Devices 路由 Schema (TypeBox 版本)
 *
 * 用于定义 Device 相关 API 的请求/响应 Schema，自动生成 OpenAPI 文档
 */

import { Type } from '@sinclair/typebox';
import { ProductEntity } from '../entities/device.entity.schema.js';

// ============================================
// 辅助 Schema（JSend 格式响应）
// ============================================

/**
 * JSend Success 响应包装器
 */
function JSendSuccess<T extends import('@sinclair/typebox').TSchema>(dataSchema: T) {
	return Type.Object({
		status: Type.Literal('success', { description: 'JSend 状态：success' }),
		data: dataSchema,
	});
}

/**
 * JSend Fail 响应
 */
const JSendFail = Type.Object({
	status: Type.Literal('fail', { description: 'JSend 状态：fail' }),
	data: Type.Object({
		message: Type.String({ description: '错误消息' }),
		code: Type.String({ description: '错误代码' }),
	}),
});

// ============================================
// GET /api/devices/products - 查询产品列表
// ============================================

/**
 * 查询产品列表 Schema
 */
export const getProductsSchema = {
	// OpenAPI 标签和文档
	tags: ['设备管理'],
	summary: '查询产品列表',
	description: '分页查询产品列表，支持关键词搜索。前端可不传参数，默认返回第 0 页的 10 条数据。',

	// 查询参数 Schema
	querystring: Type.Object({
		/** 页码（从 0 开始，可选，默认 0） */
		page: Type.Optional(
			Type.Integer({
				minimum: 0,
				default: 0,
				description: '页码（从 0 开始，默认 0）',
			}),
		),
		/** 每页数量（可选，默认 10） */
		size: Type.Optional(
			Type.Integer({
				minimum: 1,
				maximum: 100,
				default: 10,
				description: '每页数量（1-100，默认 10）',
			}),
		),
		/** 搜索关键词（可选） */
		keyword: Type.Optional(
			Type.String({
				minLength: 1,
				description: '搜索关键词',
			}),
		),
	}),

	// 响应 Schema
	response: {
		// 200 - 查询成功
		200: JSendSuccess(
			Type.Object({
				/** 产品列表 */
				products: Type.Array(ProductEntity, {
					description: '产品列表',
				}),
				/** 总记录数 */
				total: Type.Integer({
					minimum: 0,
					description: '总记录数',
				}),
			}),
		),
		// 401 - 未认证
		401: JSendFail,
		// 502 - 外部服务错误
		502: JSendFail,
		// 500 - 服务器错误
		500: JSendFail,
	},
} as const;
