/**
 * 通用 Schema 定义
 * 用于 OpenAPI 文档生成和请求验证
 */

/**
 * JSend Success 响应格式
 * 用于成功的API响应
 */
export const jsendSuccessSchema = {
	type: 'object',
	required: ['status', 'data'],
	properties: {
		status: {
			type: 'string',
			enum: ['success'],
			description: '响应状态：success',
		},
		data: {
			type: 'object',
			description: '响应数据',
		},
	},
} as const;

/**
 * JSend Fail 响应格式
 * 用于客户端错误（400系列）
 */
export const jsendFailSchema = {
	type: 'object',
	required: ['status', 'data'],
	properties: {
		status: {
			type: 'string',
			enum: ['fail'],
			description: '响应状态：fail',
		},
		data: {
			type: 'object',
			required: ['message'],
			properties: {
				message: {
					type: 'string',
					description: '错误消息',
				},
				code: {
					type: 'string',
					description: '错误代码（可选）',
				},
				details: {
					type: 'object',
					description: '详细错误信息（可选）',
				},
			},
		},
	},
} as const;

/**
 * JSend Error 响应格式
 * 用于服务器错误（500系列）
 */
export const jsendErrorSchema = {
	type: 'object',
	required: ['status', 'message'],
	properties: {
		status: {
			type: 'string',
			enum: ['error'],
			description: '响应状态：error',
		},
		message: {
			type: 'string',
			description: '错误消息',
		},
		code: {
			type: 'number',
			description: 'HTTP 状态码',
		},
		data: {
			type: 'object',
			description: '附加错误信息（可选）',
		},
	},
} as const;

/**
 * 分页参数 Schema
 * 用于列表查询接口
 */
export const paginationQuerySchema = {
	type: 'object',
	properties: {
		limit: {
			type: 'integer',
			minimum: 1,
			maximum: 100,
			default: 20,
			description: '每页数量（1-100）',
		},
		offset: {
			type: 'integer',
			minimum: 0,
			default: 0,
			description: '偏移量（从0开始）',
		},
	},
} as const;

/**
 * ID 参数 Schema
 * 用于路由参数
 */
export const idParamSchema = {
	type: 'object',
	required: ['id'],
	properties: {
		id: {
			type: 'string',
			description: '资源 ID',
		},
	},
} as const;

/**
 * 邮箱 Schema
 * 用于邮箱验证
 */
export const emailSchema = {
	type: 'string',
	format: 'email',
	description: '邮箱地址',
} as const;

/**
 * 时间戳 Schema
 */
export const timestampSchema = {
	type: 'string',
	format: 'date-time',
	description: 'ISO 8601 格式的时间戳',
} as const;

/**
 * 生成辅助函数：创建带数据的成功响应 Schema
 */
export function createSuccessResponseSchema(dataSchema: object) {
	return {
		type: 'object',
		required: ['status', 'data'],
		properties: {
			status: {
				type: 'string',
				enum: ['success'],
			},
			data: dataSchema,
		},
	};
}

/**
 * 生成辅助函数：创建通用错误响应
 */
export const commonErrorResponses = {
	400: {
		description: '客户端错误 - 请求参数有误',
		content: {
			'application/json': {
				schema: jsendFailSchema,
			},
		},
	},
	401: {
		description: '未授权 - 需要登录',
		content: {
			'application/json': {
				schema: jsendFailSchema,
			},
		},
	},
	403: {
		description: '禁止访问 - 权限不足',
		content: {
			'application/json': {
				schema: jsendFailSchema,
			},
		},
	},
	404: {
		description: '资源不存在',
		content: {
			'application/json': {
				schema: jsendFailSchema,
			},
		},
	},
	500: {
		description: '服务器内部错误',
		content: {
			'application/json': {
				schema: jsendErrorSchema,
			},
		},
	},
} as const;
