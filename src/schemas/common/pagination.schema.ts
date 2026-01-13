/**
 * 分页相关 Schema (TypeBox 版本)
 */

import { type Static, Type } from '@sinclair/typebox';

/**
 * 分页查询参数 Schema
 *
 * @example
 * GET /api/tasks?limit=20&offset=0
 */
export const PaginationQuery = Type.Object(
	{
		limit: Type.Optional(
			Type.Integer({
				minimum: 1,
				maximum: 100,
				default: 20,
				description: '每页数量 (1-100，默认 20)',
			}),
		),
		offset: Type.Optional(
			Type.Integer({
				minimum: 0,
				default: 0,
				description: '偏移量 (默认 0)',
			}),
		),
	},
	{
		$id: 'PaginationQuery',
		description: '分页查询参数',
	},
);

/**
 * 分页响应数据 Schema (不含 JSend 包装)
 *
 * @template T - 列表项类型
 * @example
 * Type.Object({
 *   items: Type.Array(TaskEntity),
 *   total: Type.Integer()
 * })
 */
export const PaginatedData = <T extends import('@sinclair/typebox').TSchema>(item: T) =>
	Type.Object(
		{
			items: Type.Array(item, { description: '数据列表' }),
			total: Type.Integer({ minimum: 0, description: '总记录数' }),
		},
		{
			description: '分页数据',
		},
	);

/**
 * 类型推导
 */
export type PaginationQueryType = Static<typeof PaginationQuery>;
export type PaginatedDataType<T extends import('@sinclair/typebox').TSchema> = Static<
	ReturnType<typeof PaginatedData<T>>
>;
