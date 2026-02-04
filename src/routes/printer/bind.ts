/**
 * 打印机绑定路由
 *
 * 功能说明:
 * - 代理外部打印机服务的绑定接口
 * - 用户输入设备名称和绑定码绑定打印机
 * - 需要用户认证
 *
 * 外部 API:
 * - POST http://device.topeai3d.com/api/v1.0/my/device/bind
 * - 请求体: { device_name: string, code: string }
 * - 响应: { code: 200, msg: "success" }
 */

import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import { getAuthTokenFromRequest } from '@/utils/request-auth.js';
import { fail, success } from '@/utils/response.js';

/**
 * 绑定请求 Schema
 */
const BindRequestSchema = Type.Object({
	device_name: Type.String({
		description: '设备名称（打印机上显示的名称）',
		minLength: 1,
	}),
	code: Type.String({
		description: '绑定码（打印机上显示的验证码）',
		minLength: 1,
	}),
});

/**
 * 绑定响应 Schema
 */
const BindResponseSchema = Type.Object({
	status: Type.Literal('success'),
	data: Type.Object({
		message: Type.String(),
	}),
});

/**
 * 错误响应 Schema
 */
const ErrorResponseSchema = Type.Object({
	status: Type.Union([Type.Literal('fail'), Type.Literal('error')]),
	data: Type.Optional(Type.Object({
		message: Type.String(),
		code: Type.Optional(Type.String()),
		details: Type.Optional(Type.Unknown()),
	})),
	message: Type.Optional(Type.String()),
	code: Type.Optional(Type.String()),
});

/**
 * 打印机绑定路由插件
 */
const bindRoute: FastifyPluginAsync = async (fastify) => {
	/**
	 * POST /api/printer/bind
	 *
	 * 绑定打印机
	 */
	fastify.post(
		'/bind',
		{
			schema: {
				description: '绑定打印机',
				tags: ['printer'],
				body: BindRequestSchema,
				response: {
					200: BindResponseSchema,
					400: ErrorResponseSchema,
					401: ErrorResponseSchema,
					500: ErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			try {
				// 从请求头获取 Token
				const token = getAuthTokenFromRequest(request);

				// 如果没有 Token，返回 401
				if (!token) {
					return reply.status(401).send(
						fail('未登录', 'UNAUTHORIZED'),
					);
				}

				// 获取请求体
				const { device_name, code } = request.body as {
					device_name: string;
					code: string;
				};

				// 调用外部 API 绑定打印机
				const response = await fetch('http://device.topeai3d.com/api/v1.0/my/device/bind', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						device_name,
						code,
					}),
				});

				// 解析响应
				const data = (await response.json()) as {
					code: number;
					msg: string;
				};

				// 检查响应状态
				if (data.code !== 200) {
					// 绑定失败
					return reply.status(400).send(
						fail(data.msg || '绑定失败', 'BIND_FAILED'),
					);
				}

				// 绑定成功
				return reply.status(200).send(
					success({ message: '绑定成功' }),
				);
			} catch (error) {
				// 捕获未预期的错误
				fastify.log.error({ error }, '绑定打印机失败');

				// 返回 500 错误
				return reply.status(500).send(
					fail('绑定打印机失败', 'INTERNAL_ERROR'),
				);
			}
		},
	);
};

export default bindRoute;
