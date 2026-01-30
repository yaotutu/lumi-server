/**
 * Device Routes
 * 设备相关的 API 路由
 *
 * 路由层职责（严格遵循 Router 层架构规范）：
 * - 只处理 HTTP 请求/响应
 * - 参数提取（从 request.query）
 * - 认证检查（getUserIdFromRequest）
 * - 调用 Service 层
 * - 返回 HTTP 状态码和 JSend 格式响应
 *
 * 不允许包含：
 * - 业务逻辑
 * - 数据验证（由 Schema 自动验证）
 * - 数据转换（由 Service 层处理）
 * - 外部服务调用（由 Service → Client 处理）
 */

import type { FastifyInstance } from 'fastify';
import { getProductsSchema } from '@/schemas/routes/devices.schema.js';
import * as DeviceService from '@/services/device.service.js';
import { logger } from '@/utils/logger.js';
import { getAuthTokenFromRequest, getUserIdFromRequest } from '@/utils/request-auth.js';
import { fail, success } from '@/utils/response.js';

/**
 * 注册设备路由
 */
export async function devicesRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/devices/products
	 * 查询产品列表
	 *
	 * 查询参数：
	 * - page: number (可选，默认 0)
	 * - size: number (可选，默认 10)
	 * - keyword: string (可选)
	 *
	 * 认证：需要用户登录
	 *
	 * 响应格式（200）：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     products: [...],
	 *     total: 100
	 *   }
	 * }
	 */
	fastify.get<{
		Querystring: {
			page?: number;
			size?: number;
			keyword?: string;
		};
	}>('/api/devices/products', { schema: getProductsSchema }, async (request, reply) => {
		try {
			// 第 1 步：认证检查（提取用户 ID）
			const userId = getUserIdFromRequest(request);

			// 第 2 步：提取 Authorization Token（使用统一工具函数）
			const token = getAuthTokenFromRequest(request);

			logger.info({
				msg: '📥 收到查询产品列表请求（Route 层）',
				userId,
				query: request.query,
			});

			// 第 3 步：调用 Service 层
			const result = await DeviceService.getProducts({
				page: request.query.page,
				size: request.query.size,
				keyword: request.query.keyword,
				token, // 透传 Token
			});

			// 第 4 步：返回成功响应（200 OK）
			return reply.send(success(result));
		} catch (error) {
			// 错误处理：根据错误类型返回适当的 HTTP 状态码
			logger.error({
				msg: '❌ 查询产品列表失败（Route 层）',
				query: request.query,
				error: error instanceof Error ? error.message : String(error),
			});

			// 认证错误（由 getUserIdFromRequest 或 getAuthTokenFromRequest 抛出）
			if (error instanceof Error && error.message.includes('认证')) {
				return reply.status(401).send(fail('用户未认证或缺少认证信息', 'UNAUTHORIZED'));
			}

			// Device 服务认证错误
			if (error instanceof Error && error.message.includes('Device 服务认证失败')) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_AUTH_ERROR'));
			}

			// 外部服务错误（由 Service 层抛出）
			if (error instanceof Error && error.message.includes('Device 服务')) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
			}

			// 服务器错误（未预期的错误）
			return reply.status(500).send(fail('查询产品列表失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});

	/**
	 * GET /api/printer/list
	 * 获取打印机列表
	 *
	 * 查询参数：
	 * - page: number (必填)
	 * - size: number (必填)
	 *
	 * 认证：需要用户登录
	 *
	 * 响应格式（200）：
	 * {
	 *   code: 200,
	 *   data: [...],
	 *   msg: "success",
	 *   total: 1
	 * }
	 */
	fastify.get<{
		Querystring: {
			page: number;
			size: number;
		};
	}>('/api/printer/list', async (request, reply) => {
		try {
			// 第 1 步：认证检查（提取用户 ID）
			const userId = getUserIdFromRequest(request);

			// 第 2 步：提取 Authorization Token
			const token = getAuthTokenFromRequest(request);

			logger.info({
				msg: '📥 收到获取打印机列表请求（Route 层）',
				userId,
				query: request.query,
			});

			// 第 3 步：调用 Service 层
			const result = await DeviceService.getPrinterList({
				page: request.query.page,
				size: request.query.size,
				token,
			});

			// 第 4 步：返回成功响应（200 OK）
			// 注意：这里直接返回外部服务的原始格式，前端适配器会处理
			return reply.send(result);
		} catch (error) {
			// 错误处理
			logger.error({
				msg: '❌ 获取打印机列表失败（Route 层）',
				query: request.query,
				error: error instanceof Error ? error.message : String(error),
			});

			// 认证错误
			if (error instanceof Error && error.message.includes('认证')) {
				return reply.status(401).send(fail('用户未认证或缺少认证信息', 'UNAUTHORIZED'));
			}

			// Device 服务认证错误
			if (error instanceof Error && error.message.includes('Device 服务认证失败')) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_AUTH_ERROR'));
			}

			// 外部服务错误
			if (error instanceof Error && error.message.includes('Device 服务')) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
			}

			// 服务器错误
			return reply.status(500).send(fail('获取打印机列表失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});

	/**
	 * GET /api/printer/:deviceId
	 * 获取打印机详情
	 *
	 * 路径参数：
	 * - deviceId: string (必填)
	 *
	 * 查询参数：
	 * - device_id: string (必填，与路径参数相同)
	 * - id: string (必填，与路径参数相同)
	 *
	 * 认证：需要用户登录
	 *
	 * 响应格式（200）：
	 * {
	 *   code: 200,
	 *   data: {...},
	 *   msg: "success",
	 *   status: {...},
	 *   task: {...}
	 * }
	 */
	fastify.get<{
		Params: {
			deviceId: string;
		};
		Querystring: {
			device_id: string;
			id: string;
		};
	}>('/api/printer/:deviceId', async (request, reply) => {
		try {
			// 第 1 步：认证检查（提取用户 ID）
			const userId = getUserIdFromRequest(request);

			// 第 2 步：提取 Authorization Token
			const token = getAuthTokenFromRequest(request);

			// 第 3 步：提取设备 ID
			const deviceId = request.params.deviceId;

			logger.info({
				msg: '📥 收到获取打印机详情请求（Route 层）',
				userId,
				deviceId,
			});

			// 第 4 步：调用 Service 层
			const result = await DeviceService.getPrinterDetail(deviceId, token);

			// 第 5 步：返回成功响应（200 OK）
			// 注意：这里直接返回外部服务的原始格式，前端适配器会处理
			return reply.send(result);
		} catch (error) {
			// 错误处理
			logger.error({
				msg: '❌ 获取打印机详情失败（Route 层）',
				deviceId: request.params.deviceId,
				error: error instanceof Error ? error.message : String(error),
			});

			// 认证错误
			if (error instanceof Error && error.message.includes('认证')) {
				return reply.status(401).send(fail('用户未认证或缺少认证信息', 'UNAUTHORIZED'));
			}

			// Device 服务认证错误
			if (error instanceof Error && error.message.includes('Device 服务认证失败')) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_AUTH_ERROR'));
			}

			// 外部服务错误
			if (error instanceof Error && error.message.includes('Device 服务')) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
			}

			// 服务器错误
			return reply.status(500).send(fail('获取打印机详情失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});

	/**
	 * POST /api/printer/bind
	 * 绑定打印机
	 *
	 * 请求体：
	 * - device_name: string (必填，设备名称)
	 * - code: string (必填，绑定码)
	 *
	 * 认证：需要用户登录
	 *
	 * 响应格式（200）：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     message: '绑定成功'
	 *   }
	 * }
	 */
	fastify.post<{
		Body: {
			device_name: string;
			code: string;
		};
	}>('/api/printer/bind', async (request, reply) => {
		try {
			// 第 1 步：认证检查（提取用户 ID）
			const userId = getUserIdFromRequest(request);

			// 第 2 步：提取 Authorization Token
			const token = getAuthTokenFromRequest(request);

			// 第 3 步：提取请求体
			const { device_name, code } = request.body;

			logger.info({
				msg: '📥 收到绑定打印机请求（Route 层）',
				userId,
				device_name,
			});

			// 第 4 步：调用 Service 层
			await DeviceService.bindPrinter({
				device_name,
				code,
				token,
			});

			// 第 5 步：返回成功响应（200 OK）
			return reply.send(
				success({
					message: '绑定成功',
				}),
			);
		} catch (error) {
			// 错误处理
			logger.error({
				msg: '❌ 绑定打印机失败（Route 层）',
				body: request.body,
				error: error instanceof Error ? error.message : String(error),
			});

			// 认证错误
			if (error instanceof Error && error.message.includes('认证')) {
				return reply.status(401).send(fail('用户未认证或缺少认证信息', 'UNAUTHORIZED'));
			}

			// Device 服务认证错误
			if (error instanceof Error && error.message.includes('Device 服务认证失败')) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_AUTH_ERROR'));
			}

			// 绑定失败（外部服务返回错误）
			if (error instanceof Error && error.message.includes('绑定失败')) {
				return reply.status(400).send(fail(error.message, 'BIND_FAILED'));
			}

			// 外部服务错误
			if (error instanceof Error && error.message.includes('Device 服务')) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
			}

			// 服务器错误
			return reply.status(500).send(fail('绑定打印机失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});

	/**
	 * POST /api/printer/unbind
	 * 解绑打印机
	 *
	 * 请求体：
	 * - device_id: string (必填，设备 ID)
	 *
	 * 认证：需要用户登录
	 *
	 * 响应格式（200）：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     message: '解绑成功'
	 *   }
	 * }
	 */
	fastify.post<{
		Body: {
			device_id: string;
		};
	}>('/api/printer/unbind', async (request, reply) => {
		try {
			// 第 1 步：认证检查（提取用户 ID）
			const userId = getUserIdFromRequest(request);

			// 第 2 步：提取 Authorization Token
			const token = getAuthTokenFromRequest(request);

			// 第 3 步：提取请求体
			const { device_id } = request.body;

			logger.info({
				msg: '📥 收到解绑打印机请求（Route 层）',
				userId,
				device_id,
			});

			// 第 4 步：调用 Service 层
			await DeviceService.unbindPrinter({
				device_id,
				token,
			});

			// 第 5 步：返回成功响应（200 OK）
			return reply.send(
				success({
					message: '解绑成功',
				}),
			);
		} catch (error) {
			// 错误处理
			logger.error({
				msg: '❌ 解绑打印机失败（Route 层）',
				body: request.body,
				error: error instanceof Error ? error.message : String(error),
			});

			// 认证错误
			if (error instanceof Error && error.message.includes('认证')) {
				return reply.status(401).send(fail('用户未认证或缺少认证信息', 'UNAUTHORIZED'));
			}

			// Device 服务认证错误
			if (error instanceof Error && error.message.includes('Device 服务认证失败')) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_AUTH_ERROR'));
			}

			// 解绑失败（外部服务返回错误）
			if (error instanceof Error && error.message.includes('解绑失败')) {
				return reply.status(400).send(fail(error.message, 'UNBIND_FAILED'));
			}

			// 外部服务错误
			if (error instanceof Error && error.message.includes('Device 服务')) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
			}

			// 服务器错误
			return reply.status(500).send(fail('解绑打印机失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});
}
