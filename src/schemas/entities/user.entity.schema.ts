/**
 * User 实体 Schema
 * 外部用户服务返回的用户信息
 */

import { type Static, Type } from '@sinclair/typebox';

/**
 * 外部用户实体 Schema
 * 对应外部用户服务的返回格式
 */
export const UserEntity = Type.Object(
	{
		id: Type.String({ description: '用户 ID' }),
		email: Type.String({ format: 'email', description: '邮箱' }),
		userName: Type.String({ description: '用户名' }),
		nickName: Type.String({ description: '昵称' }),
		avatar: Type.Union([Type.String({ format: 'uri' }), Type.Null()], {
			description: '头像 URL',
		}),
		gender: Type.String({ description: '性别' }),
	},
	{
		$id: 'UserEntity',
		description: '用户实体',
	},
);

/**
 * 用户摘要 Schema (用于关联展示)
 */
export const UserSummary = Type.Object(
	{
		id: Type.String({ description: '用户 ID' }),
		userName: Type.String({ description: '用户名' }),
		avatar: Type.Union([Type.String({ format: 'uri' }), Type.Null()]),
	},
	{
		$id: 'UserSummary',
		description: '用户摘要信息',
	},
);

/**
 * 类型推导
 */
export type UserEntityType = Static<typeof UserEntity>;
export type UserSummaryType = Static<typeof UserSummary>;
