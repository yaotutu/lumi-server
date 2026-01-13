/**
 * 通用 ID 参数 Schema (TypeBox 版本)
 */

import { type Static, Type } from '@sinclair/typebox';

/**
 * 路径参数中的 ID Schema
 *
 * @example
 * GET /api/tasks/:id
 */
export const IdParam = Type.Object(
	{
		id: Type.String({
			description: '资源 ID',
			minLength: 1,
		}),
	},
	{
		$id: 'IdParam',
		description: 'ID 路径参数',
	},
);

/**
 * UUID 格式的 ID 参数 Schema
 *
 * @example
 * GET /api/tasks/:id (UUID 格式)
 */
export const UuidParam = Type.Object(
	{
		id: Type.String({
			description: '资源 ID (UUID 格式)',
			format: 'uuid',
		}),
	},
	{
		$id: 'UuidParam',
		description: 'UUID 格式的 ID 路径参数',
	},
);

/**
 * 整数 ID 参数 Schema
 *
 * @example
 * GET /api/users/:id (整数)
 */
export const IntIdParam = Type.Object(
	{
		id: Type.Integer({
			description: '资源 ID (整数)',
			minimum: 1,
		}),
	},
	{
		$id: 'IntIdParam',
		description: '整数 ID 路径参数',
	},
);

/**
 * 类型推导
 */
export type IdParamType = Static<typeof IdParam>;
export type UuidParamType = Static<typeof UuidParam>;
export type IntIdParamType = Static<typeof IntIdParam>;
