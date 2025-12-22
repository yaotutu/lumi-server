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
	description: '向指定邮箱发送验证码，有效期 10 分钟',
	body: {
		type: 'object',
		required: ['email', 'type'],
		properties: {
			email: emailSchema,
			type: {
				type: 'string',
				enum: ['login', 'register', 'modify_password'],
				description: '验证码类型',
			},
		},
	},
	response: {
		200: createSuccessResponseSchema({
			type: 'null',
			description: '发送成功',
		}),
	},
} as const;

/**
 * POST /api/auth/register - 用户注册
 */
export const registerSchema = {
	tags: ['认证'],
	summary: '用户注册',
	description: '使用邮箱和验证码注册新用户',
	body: {
		type: 'object',
		required: ['email', 'code'],
		properties: {
			email: emailSchema,
			code: {
				type: 'string',
				description: '验证码',
			},
		},
	},
	response: {
		200: createSuccessResponseSchema({
			type: 'null',
			description: '注册成功',
		}),
	},
} as const;

/**
 * POST /api/auth/login - 用户登录
 */
export const loginSchema = {
	tags: ['认证'],
	summary: '用户登录',
	description: '使用邮箱和验证码登录，成功后返回 Bearer Token',
	body: {
		type: 'object',
		required: ['email', 'code'],
		properties: {
			email: emailSchema,
			code: {
				type: 'string',
				description: '验证码',
			},
		},
	},
	response: {
		200: createSuccessResponseSchema({
			type: 'object',
			properties: {
				token: { type: 'string', description: 'Bearer Token' },
			},
			required: ['token'],
		}),
	},
} as const;

/**
 * 外部用户服务返回的用户对象 Schema
 */
export const externalUserSchema = {
	type: 'object',
	properties: {
		id: { type: 'string', description: '用户 ID' },
		email: emailSchema,
		userName: { type: 'string', description: '用户名' },
		nickName: { type: 'string', description: '昵称' },
		avatar: { type: ['string', 'null'], description: '头像 URL' },
		gender: { type: 'string', description: '性别' },
	},
} as const;

/**
 * GET /api/auth/me - 获取当前用户
 */
export const getMeSchema = {
	tags: ['认证'],
	summary: '获取当前登录用户',
	description: '通过 Bearer Token 获取当前登录用户信息',
	response: {
		200: createSuccessResponseSchema({
			type: 'object',
			properties: {
				status: {
					type: 'string',
					enum: ['authenticated', 'unauthenticated', 'error'],
					description: '认证状态',
				},
				user: {
					oneOf: [externalUserSchema, { type: 'null' }],
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
	description: '注销当前登录会话',
	response: {
		200: createSuccessResponseSchema({
			type: 'null',
			description: '登出成功',
		}),
	},
} as const;
