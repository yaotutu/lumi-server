/**
 * Auth（认证）相关的 Schema 定义
 */

import { createSuccessResponseSchema, emailSchema } from './common.schema';

/**
 * 用户对象 Schema
 */
export const userSchema = {
	type: 'object',
	properties: {
		id: { type: 'string', description: '用户 ID' },
		email: emailSchema,
		name: { type: 'string', description: '用户名' },
		avatar: { type: ['string', 'null'], description: '头像 URL' },
	},
} as const;

/**
 * POST /api/auth/send-code - 发送验证码
 */
export const sendCodeSchema = {
	tags: ['认证'],
	summary: '发送邮箱验证码',
	description: '向指定邮箱发送 4 位数字验证码，有效期 10 分钟。开发环境会在响应中返回验证码。',
	body: {
		type: 'object',
		required: ['email'],
		properties: {
			email: emailSchema,
		},
	},
	response: {
		200: createSuccessResponseSchema({
			type: 'object',
			properties: {
				message: { type: 'string', description: '提示信息' },
				code: { type: 'string', description: '验证码（仅开发环境）' },
			},
		}),
		400: {
			description: '邮箱格式不正确',
		},
	},
} as const;

/**
 * POST /api/auth/verify-code - 验证码登录
 */
export const verifyCodeSchema = {
	tags: ['认证'],
	summary: '验证码登录',
	description: '使用邮箱和验证码登录，成功后会设置 Session Cookie',
	body: {
		type: 'object',
		required: ['email', 'code'],
		properties: {
			email: emailSchema,
			code: {
				type: 'string',
				pattern: '^[0-9]{4}$',
				description: '4 位数字验证码',
			},
		},
	},
	response: {
		200: createSuccessResponseSchema({
			type: 'object',
			properties: {
				user: userSchema,
				message: { type: 'string' },
			},
		}),
		400: {
			description: '验证码无效或已过期',
		},
	},
} as const;

/**
 * GET /api/auth/me - 获取当前用户
 */
export const getMeSchema = {
	tags: ['认证'],
	summary: '获取当前登录用户',
	description: '通过 Session Cookie 获取当前登录用户信息',
	response: {
		200: createSuccessResponseSchema({
			type: 'object',
			properties: {
				status: {
					type: 'string',
					enum: ['authenticated', 'unauthenticated', 'expired', 'error'],
					description: '认证状态',
				},
				user: {
					oneOf: [userSchema, { type: 'null' }],
					description: '用户信息（未登录时为 null）',
				},
			},
			required: ['status', 'user'],
		}),
	},
} as const;

/**
 * POST /api/auth/logout - 登出
 */
export const logoutSchema = {
	tags: ['认证'],
	summary: '登出',
	description: '清除 Session Cookie，退出登录',
	response: {
		200: createSuccessResponseSchema({
			type: 'object',
			properties: {
				message: { type: 'string' },
			},
		}),
		500: {
			description: '服务器错误',
			type: 'object',
			properties: {
				status: { type: 'string' },
				data: { type: 'object' },
			},
		},
	},
} as const;
