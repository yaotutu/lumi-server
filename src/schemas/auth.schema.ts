/**
 * Auth（认证）相关的 Schema 定义 (TypeBox 版本)
 */

import { Type } from '@sinclair/typebox';
import { JSendFail, JSendSuccess } from './common';
import { UserStatsEntity } from './entities/user.entity.schema';

/**
 * POST /api/auth/send-code - 发送验证码
 */
export const sendCodeSchema = {
	tags: ['认证'],
	summary: '发送邮箱验证码',
	description: '向指定邮箱发送验证码，有效期 10 分钟',
	body: Type.Object({
		email: Type.String({
			format: 'email',
			description: '邮箱地址',
		}),
		type: Type.Union(
			[Type.Literal('login'), Type.Literal('register'), Type.Literal('modify_password')],
			{
				description: '验证码类型：login(登录) | register(注册) | modify_password(修改密码)',
			},
		),
	}),
	response: {
		200: JSendSuccess(Type.Null()),
		400: JSendFail, // 参数错误
		500: JSendFail, // 发送失败
	},
} as const;

/**
 * POST /api/auth/register - 用户注册
 */
export const registerSchema = {
	tags: ['认证'],
	summary: '用户注册',
	description: '使用邮箱和验证码注册新用户',
	body: Type.Object({
		email: Type.String({
			format: 'email',
			description: '邮箱地址',
		}),
		code: Type.String({
			minLength: 4,
			maxLength: 6,
			description: '验证码（4-6位）',
		}),
	}),
	response: {
		200: JSendSuccess(Type.Null()),
		400: JSendFail, // 验证码错误或已过期
		500: JSendFail, // 注册失败
	},
} as const;

/**
 * POST /api/auth/login - 用户登录
 */
export const loginSchema = {
	tags: ['认证'],
	summary: '用户登录',
	description: '使用邮箱和验证码登录，成功后返回 Bearer Token',
	body: Type.Object({
		email: Type.String({
			format: 'email',
			description: '邮箱地址',
		}),
		code: Type.String({
			minLength: 4,
			maxLength: 6,
			description: '验证码（4-6位）',
		}),
	}),
	response: {
		200: JSendSuccess(
			Type.Object({
				token: Type.String({
					description: 'Bearer Token（用于后续请求的身份验证）',
				}),
			}),
		),
		400: JSendFail, // 验证码错误或已过期
		401: JSendFail, // 登录失败
		500: JSendFail, // 服务器错误
	},
} as const;

/**
 * GET /api/auth/me - 获取当前用户
 */
export const getMeSchema = {
	tags: ['认证'],
	summary: '获取当前登录用户',
	description: '通过 Bearer Token 获取当前登录用户信息（包含统计数据）',
	response: {
		200: JSendSuccess(
			Type.Object({
				status: Type.Union(
					[Type.Literal('authenticated'), Type.Literal('unauthenticated'), Type.Literal('error')],
					{
						description: '认证状态：authenticated(已认证) | unauthenticated(未认证) | error(错误)',
					},
				),
				user: Type.Union(
					[
						Type.Object({
							id: Type.String({ description: '用户 ID' }),
							email: Type.Optional(Type.String({ format: 'email', description: '邮箱' })),
							userName: Type.String({ description: '用户名' }),
							nickName: Type.String({ description: '昵称' }),
							avatar: Type.Optional(
								Type.Union([Type.String(), Type.Null()], {
									description: '头像 URL（可选）',
								}),
							),
							gender: Type.Optional(Type.String({ description: '性别（可选）' })),
							stats: Type.Optional(UserStatsEntity, { description: '用户统计数据（可选）' }),
						}),
						Type.Null(),
					],
					{
						description: '用户信息（未登录时为 null）',
					},
				),
			}),
		),
		// 注意：此接口即使发生错误也返回 200，通过 data.status 字段区分状态
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
		200: JSendSuccess(Type.Null()),
		500: JSendFail, // 服务器错误（即使出错也会返回成功，本地清除状态即可）
	},
} as const;
