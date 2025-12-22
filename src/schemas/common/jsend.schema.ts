/**
 * JSend 响应格式 Schema (TypeBox 版本)
 *
 * JSend 是一个简单的 JSON 响应格式规范
 * 参考: https://github.com/omniti-labs/jsend
 */

import { type Static, type TSchema, Type } from '@sinclair/typebox';

/**
 * JSend 成功响应 Schema
 *
 * @template T - 数据类型
 * @example
 * JSendSuccess(Type.Object({ id: Type.String() }))
 * // 生成:
 * // {
 * //   status: 'success',
 * //   data: { id: string }
 * // }
 */
export const JSendSuccess = <T extends TSchema>(data: T) =>
	Type.Object(
		{
			status: Type.Literal('success', { description: '成功状态' }),
			data: data,
		},
		{
			$id: 'JSendSuccess',
			description: 'JSend 成功响应',
		},
	);

/**
 * JSend 失败响应 Schema (客户端错误，如验证失败)
 *
 * @example
 * {
 *   status: 'fail',
 *   data: {
 *     message: '邮箱格式不正确',
 *     code: 'INVALID_EMAIL'
 *   }
 * }
 */
export const JSendFail = Type.Object(
	{
		status: Type.Literal('fail', { description: '失败状态（客户端错误）' }),
		data: Type.Object({
			message: Type.String({ description: '错误信息' }),
			code: Type.Optional(Type.String({ description: '错误代码' })),
		}),
	},
	{
		$id: 'JSendFail',
		description: 'JSend 失败响应（客户端错误）',
	},
);

/**
 * JSend 错误响应 Schema (服务端错误)
 *
 * @example
 * {
 *   status: 'error',
 *   message: '服务器内部错误',
 *   code: 'INTERNAL_SERVER_ERROR'
 * }
 */
export const JSendError = Type.Object(
	{
		status: Type.Literal('error', { description: '错误状态（服务端错误）' }),
		message: Type.String({ description: '错误信息' }),
		code: Type.Optional(Type.String({ description: '错误代码' })),
		data: Type.Optional(Type.Unknown({ description: '附加错误数据' })),
	},
	{
		$id: 'JSendError',
		description: 'JSend 错误响应（服务端错误）',
	},
);

/**
 * JSend 列表响应 Schema (带分页)
 *
 * @template T - 列表项类型
 * @example
 * JSendList(Type.Object({ id: Type.String(), name: Type.String() }))
 * // 生成:
 * // {
 * //   status: 'success',
 * //   data: {
 * //     items: Array<{ id: string, name: string }>,
 * //     total: number
 * //   }
 * // }
 */
export const JSendList = <T extends TSchema>(item: T) =>
	Type.Object(
		{
			status: Type.Literal('success'),
			data: Type.Object({
				items: Type.Array(item, { description: '数据列表' }),
				total: Type.Integer({ minimum: 0, description: '总数' }),
			}),
		},
		{
			$id: 'JSendList',
			description: 'JSend 列表响应（带总数）',
		},
	);

/**
 * 类型推导辅助工具
 */
export type JSendSuccessType<T extends TSchema> = Static<ReturnType<typeof JSendSuccess<T>>>;
export type JSendFailType = Static<typeof JSendFail>;
export type JSendErrorType = Static<typeof JSendError>;
export type JSendListType<T extends TSchema> = Static<ReturnType<typeof JSendList<T>>>;
