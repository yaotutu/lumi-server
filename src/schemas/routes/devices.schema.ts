/**
 * Devices 路由 Schema (TypeBox 版本)
 *
 * 用于定义 Device 相关 API 的请求/响应 Schema，自动生成 OpenAPI 文档
 */

import { Type } from '@sinclair/typebox';
import {
	CurrentJobSchema,
	PrinterRealtimeStatusSchema,
	PrinterSchema,
	PrinterStatusDataSchema,
	PrinterStatusEnum,
	ProductEntity,
} from '../entities/device.entity.schema.js';

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

// ============================================
// 打印机相关 Schema（新版本 RESTful API）
// ============================================

/**
 * GET /api/printers - 获取打印机列表 Schema
 */
export const getPrintersSchema = {
	tags: ['打印机管理'],
	summary: '获取打印机列表',
	description: '获取打印机列表，默认包含实时状态。一次请求获取完整信息，无需二次请求。',

	querystring: Type.Object({
		/** 页码（从 1 开始，可选，默认 1） */
		page: Type.Optional(
			Type.Integer({
				minimum: 1,
				default: 1,
				description: '页码（从 1 开始，默认 1）',
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
		/** 是否包含实时状态（可选，默认 true） */
		includeStatus: Type.Optional(
			Type.Boolean({
				default: true,
				description: '是否包含实时状态（默认 true）',
			}),
		),
	}),

	response: {
		200: JSendSuccess(
			Type.Object({
				/** 打印机列表 */
				printers: Type.Array(PrinterSchema, { description: '打印机列表' }),
				/** 总记录数 */
				total: Type.Integer({ minimum: 0, description: '总记录数' }),
				/** 当前页码 */
				page: Type.Integer({ minimum: 1, description: '当前页码' }),
				/** 每页数量 */
				size: Type.Integer({ minimum: 1, description: '每页数量' }),
			}),
		),
		401: JSendFail,
		502: JSendFail,
		500: JSendFail,
	},
} as const;

/**
 * GET /api/printers/:id - 获取单台打印机详情 Schema
 */
export const getPrinterSchema = {
	tags: ['打印机管理'],
	summary: '获取单台打印机详情',
	description: '获取单台打印机的完整信息，包括基本信息、实时状态和当前任务。',

	params: Type.Object({
		/** 打印机 ID（device_name） */
		id: Type.String({ description: '打印机 ID（device_name）' }),
	}),

	response: {
		200: JSendSuccess(
			Type.Object({
				/** 打印机完整信息 */
				printer: PrinterSchema,
			}),
		),
		401: JSendFail,
		404: JSendFail,
		502: JSendFail,
		500: JSendFail,
	},
} as const;

/**
 * POST /api/printers/batch - 批量获取打印机详情 Schema
 */
export const batchGetPrintersSchema = {
	tags: ['打印机管理'],
	summary: '批量获取打印机详情',
	description: '一次请求获取多台打印机的完整信息，最多支持 20 台。单个失败不影响整体。',

	body: Type.Object({
		/** 打印机 ID 列表 */
		ids: Type.Array(Type.String(), {
			minItems: 1,
			maxItems: 20,
			description: '打印机 ID 列表（最多 20 个）',
		}),
	}),

	response: {
		200: JSendSuccess(
			Type.Object({
				/** 打印机列表（失败的会被过滤掉） */
				printers: Type.Array(PrinterSchema, { description: '打印机列表' }),
			}),
		),
		400: JSendFail,
		401: JSendFail,
		502: JSendFail,
		500: JSendFail,
	},
} as const;

/**
 * GET /api/printers/:id/status - 获取打印机实时状态 Schema
 */
export const getPrinterStatusSchema = {
	tags: ['打印机管理'],
	summary: '获取打印机实时状态',
	description:
		'只返回实时变化的数据（状态、温度、进度），不返回基本信息。专为轮询场景优化，节省带宽。',

	params: Type.Object({
		/** 打印机 ID（device_name） */
		id: Type.String({ description: '打印机 ID（device_name）' }),
	}),

	response: {
		200: JSendSuccess(PrinterStatusDataSchema),
		401: JSendFail,
		404: JSendFail,
		502: JSendFail,
		500: JSendFail,
	},
} as const;

/**
 * POST /api/printers - 绑定打印机 Schema
 */
export const bindPrinterSchema = {
	tags: ['打印机管理'],
	summary: '绑定打印机',
	description: '绑定新打印机，绑定成功后返回打印机完整信息。',

	body: Type.Object({
		/** 设备名称 */
		deviceName: Type.String({ description: '设备名称（打印机上显示的名称）' }),
		/** 绑定码 */
		code: Type.String({ description: '绑定码（打印机上显示的验证码）' }),
	}),

	response: {
		201: JSendSuccess(
			Type.Object({
				/** 绑定后的打印机完整信息 */
				printer: PrinterSchema,
			}),
		),
		400: JSendFail,
		401: JSendFail,
		502: JSendFail,
		500: JSendFail,
	},
} as const;

/**
 * DELETE /api/printers/:id - 解绑打印机 Schema
 */
export const unbindPrinterSchema = {
	tags: ['打印机管理'],
	summary: '解绑打印机',
	description: '解绑指定的打印机。',

	params: Type.Object({
		/** 打印机 ID（device_name） */
		id: Type.String({ description: '打印机 ID（device_name）' }),
	}),

	response: {
		200: JSendSuccess(
			Type.Object({
				/** 成功消息 */
				message: Type.String({ description: '成功消息' }),
			}),
		),
		400: JSendFail,
		401: JSendFail,
		502: JSendFail,
		500: JSendFail,
	},
} as const;

/**
 * POST /api/printers/:id/jobs - 创建打印任务 Schema
 */
export const createPrintJobSchema = {
	tags: ['打印机管理'],
	summary: '创建打印任务',
	description: '为指定打印机创建打印任务。',

	params: Type.Object({
		/** 打印机 ID（device_name） */
		id: Type.String({ description: '打印机 ID（device_name）' }),
	}),

	body: Type.Object({
		/** 文件名称 */
		fileName: Type.String({ description: '文件名称' }),
		/** G-code 文件 URL */
		gcodeUrl: Type.String({ format: 'uri', description: 'G-code 文件 URL' }),
	}),

	response: {
		201: JSendSuccess(
			Type.Object({
				/** 打印任务信息 */
				job: Type.Object({
					/** 任务 ID */
					id: Type.String({ description: '任务 ID' }),
					/** 任务名称 */
					name: Type.String({ description: '任务名称' }),
					/** 任务状态 */
					status: Type.String({ description: '任务状态' }),
					/** 创建时间 */
					createdAt: Type.String({ format: 'date-time', description: '创建时间（ISO 8601 格式）' }),
				}),
			}),
		),
		400: JSendFail,
		401: JSendFail,
		502: JSendFail,
		500: JSendFail,
	},
} as const;
