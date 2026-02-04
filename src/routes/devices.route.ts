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
import {
	batchGetPrintersSchema,
	bindPrinterSchema,
	createPrintJobSchema,
	getPrinterSchema,
	getPrinterStatusSchema,
	getPrintersSchema,
	getProductsSchema,
	unbindPrinterSchema,
} from '@/schemas/routes/devices.schema.js';
import * as DeviceService from '@/services/device.service.js';
import {
	ExternalAPIError,
	NotFoundError,
	UnauthenticatedError,
	ValidationError,
} from '@/utils/errors.js';
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

			// ✅ 使用 instanceof 检查错误类型
			if (error instanceof UnauthenticatedError) {
				return reply.status(401).send(fail('用户未认证或缺少认证信息', 'UNAUTHENTICATED'));
			}

			if (error instanceof ExternalAPIError) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
			}

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, 'VALIDATION_ERROR'));
			}

			// 服务器错误（未预期的错误）
			return reply.status(500).send(fail('查询产品列表失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});

	// ============================================
	// 打印机管理 API（RESTful 风格）
	// ============================================

	/**
	 * GET /api/printers
	 * 获取打印机列表（默认包含实时状态）
	 *
	 * 查询参数：
	 * - page: number (可选，默认 1)
	 * - size: number (可选，默认 10)
	 * - includeStatus: boolean (可选，默认 true)
	 *
	 * 认证：需要用户登录
	 *
	 * 响应格式（200）：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     printers: [...],  // 打印机列表（camelCase + ISO 8601 时间）
	 *     total: 10,
	 *     page: 1,
	 *     size: 10
	 *   }
	 * }
	 */
	fastify.get<{
		Querystring: {
			page?: number;
			size?: number;
			includeStatus?: boolean;
		};
	}>('/api/printers', { schema: getPrintersSchema }, async (request, reply) => {
		try {
			// 第 1 步：认证检查（提取用户 ID）
			const userId = getUserIdFromRequest(request);

			// 第 2 步：提取 Authorization Token
			const token = getAuthTokenFromRequest(request);

			logger.info({
				msg: '📥 收到获取打印机列表请求（新版本 Route 层）',
				userId,
				query: request.query,
			});

			// 第 3 步：调用 Service 层（新版本）
			const result = await DeviceService.getPrinterList(userId, token, {
				page: request.query.page,
				size: request.query.size,
				includeStatus: request.query.includeStatus,
			});

			// 第 4 步：返回成功响应（200 OK）
			return reply.send(success(result));
		} catch (error) {
			// 错误处理
			logger.error({
				msg: '❌ 获取打印机列表失败（新版本 Route 层）',
				query: request.query,
				error: error instanceof Error ? error.message : String(error),
			});

			// ✅ 使用 instanceof 检查错误类型
			if (error instanceof UnauthenticatedError) {
				return reply.status(401).send(fail('用户未认证或缺少认证信息', 'UNAUTHENTICATED'));
			}

			if (error instanceof ExternalAPIError) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
			}

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, 'VALIDATION_ERROR'));
			}

			// 服务器错误
			return reply
				.status(500)
				.send(fail('获取打印机列表失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});

	/**
	 * GET /api/printers/:id
	 * 获取单台打印机详情
	 *
	 * 路径参数：
	 * - id: string (必填，打印机 ID / device_name)
	 *
	 * 认证：需要用户登录
	 *
	 * 响应格式（200）：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     printer: {...}  // 打印机完整信息（camelCase + ISO 8601 时间）
	 *   }
	 * }
	 */
	fastify.get<{
		Params: {
			id: string;
		};
	}>('/api/printers/:id', { schema: getPrinterSchema }, async (request, reply) => {
		try {
			// 第 1 步：认证检查（提取用户 ID）
			const userId = getUserIdFromRequest(request);

			// 第 2 步：提取 Authorization Token
			const token = getAuthTokenFromRequest(request);

			// 第 3 步：提取打印机 ID
			const { id } = request.params;

			logger.info({
				msg: '📥 收到获取打印机详情请求（新版本 Route 层）',
				userId,
				id,
			});

			// 第 4 步：调用 Service 层（新版本）
			const printer = await DeviceService.getPrinter(id, token);

			// 第 5 步：返回成功响应（200 OK）
			return reply.send(success({ printer }));
		} catch (error) {
			// 错误处理
			logger.error({
				msg: '❌ 获取打印机详情失败（新版本 Route 层）',
				id: request.params.id,
				error: error instanceof Error ? error.message : String(error),
			});

			// ✅ 使用 instanceof 检查错误类型
			if (error instanceof UnauthenticatedError) {
				return reply.status(401).send(fail('用户未认证或缺少认证信息', 'UNAUTHENTICATED'));
			}

			if (error instanceof NotFoundError) {
				return reply.status(404).send(fail('打印机不存在', 'PRINTER_NOT_FOUND'));
			}

			if (error instanceof ExternalAPIError) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
			}

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, 'VALIDATION_ERROR'));
			}

			// 服务器错误
			return reply
				.status(500)
				.send(fail('获取打印机详情失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});

	/**
	 * POST /api/printers/batch
	 * 批量获取打印机详情
	 *
	 * 请求体：
	 * - ids: string[] (必填，打印机 ID 列表，最多 20 个)
	 *
	 * 认证：需要用户登录
	 *
	 * 响应格式（200）：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     printers: [...]  // 打印机列表（失败的会被过滤掉）
	 *   }
	 * }
	 */
	fastify.post<{
		Body: {
			ids: string[];
		};
	}>('/api/printers/batch', { schema: batchGetPrintersSchema }, async (request, reply) => {
		try {
			// 第 1 步：认证检查（提取用户 ID）
			const userId = getUserIdFromRequest(request);

			// 第 2 步：提取 Authorization Token
			const token = getAuthTokenFromRequest(request);

			// 第 3 步：提取请求体
			const { ids } = request.body;

			logger.info({
				msg: '📥 收到批量获取打印机详情请求（新版本 Route 层）',
				userId,
				count: ids.length,
			});

			// 第 4 步：调用 Service 层（新版本）
			const printers = await DeviceService.batchGetPrinters(ids, token);

			// 第 5 步：返回成功响应（200 OK）
			return reply.send(success({ printers }));
		} catch (error) {
			// 错误处理
			logger.error({
				msg: '❌ 批量获取打印机详情失败（新版本 Route 层）',
				body: request.body,
				error: error instanceof Error ? error.message : String(error),
			});

			// ✅ 使用 instanceof 检查错误类型
			if (error instanceof UnauthenticatedError) {
				return reply.status(401).send(fail('用户未认证或缺少认证信息', 'UNAUTHENTICATED'));
			}

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, 'VALIDATION_ERROR'));
			}

			if (error instanceof ExternalAPIError) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
			}

			// 服务器错误
			return reply
				.status(500)
				.send(fail('批量获取打印机详情失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});

	/**
	 * GET /api/printers/:id/status
	 * 获取打印机实时状态（轮询优化）
	 *
	 * 路径参数：
	 * - id: string (必填，打印机 ID / device_name)
	 *
	 * 认证：需要用户登录
	 *
	 * 响应格式（200）：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     status: 'PRINTING',
	 *     realtimeStatus: {...},
	 *     currentJob: {...},
	 *     updatedAt: '2026-01-31T10:30:00Z'
	 *   }
	 * }
	 */
	fastify.get<{
		Params: {
			id: string;
		};
	}>('/api/printers/:id/status', { schema: getPrinterStatusSchema }, async (request, reply) => {
		try {
			// 第 1 步：认证检查（提取用户 ID）
			const userId = getUserIdFromRequest(request);

			// 第 2 步：提取 Authorization Token
			const token = getAuthTokenFromRequest(request);

			// 第 3 步：提取打印机 ID
			const { id } = request.params;

			logger.info({
				msg: '📥 收到获取打印机实时状态请求（新版本 Route 层）',
				userId,
				id,
			});

			// 第 4 步：调用 Service 层（新版本）
			const status = await DeviceService.getPrinterStatus(id, token);

			// 第 5 步：返回成功响应（200 OK）
			return reply.send(success(status));
		} catch (error) {
			// 错误处理
			logger.error({
				msg: '❌ 获取打印机实时状态失败（新版本 Route 层）',
				id: request.params.id,
				error: error instanceof Error ? error.message : String(error),
			});

			// ✅ 使用 instanceof 检查错误类型
			if (error instanceof UnauthenticatedError) {
				return reply.status(401).send(fail('用户未认证或缺少认证信息', 'UNAUTHENTICATED'));
			}

			if (error instanceof NotFoundError) {
				return reply.status(404).send(fail('打印机不存在', 'PRINTER_NOT_FOUND'));
			}

			if (error instanceof ExternalAPIError) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
			}

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, 'VALIDATION_ERROR'));
			}

			// 服务器错误
			return reply
				.status(500)
				.send(fail('获取打印机实时状态失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});

	/**
	 * POST /api/printers
	 * 绑定打印机
	 *
	 * 请求体：
	 * - deviceName: string (必填，设备名称)
	 * - code: string (必填，绑定码)
	 *
	 * 认证：需要用户登录
	 *
	 * 响应格式（201）：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     message: '打印机绑定成功'
	 *   }
	 * }
	 */
	fastify.post<{
		Body: {
			deviceName: string;
			code: string;
		};
	}>('/api/printers', { schema: bindPrinterSchema }, async (request, reply) => {
		try {
			// 第 1 步：认证检查（提取用户 ID）
			const userId = getUserIdFromRequest(request);

			// 第 2 步：提取 Authorization Token
			const token = getAuthTokenFromRequest(request);

			// 第 3 步：提取请求体
			const { deviceName, code } = request.body;

			logger.info({
				msg: '📥 收到绑定打印机请求（新版本 Route 层）',
				userId,
				deviceName,
			});

			// 第 4 步：调用 Service 层（新版本）
			const result = await DeviceService.bindPrinter({
				deviceName,
				code,
				token,
			});

			// 第 5 步：返回成功响应（201 Created）
			return reply.status(201).send(success(result));
		} catch (error) {
			// 错误处理
			logger.error({
				msg: '❌ 绑定打印机失败（新版本 Route 层）',
				body: request.body,
				error: error instanceof Error ? error.message : String(error),
			});

			// ✅ 使用 instanceof 检查错误类型
			if (error instanceof UnauthenticatedError) {
				return reply.status(401).send(fail('用户未认证或缺少认证信息', 'UNAUTHENTICATED'));
			}

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, 'VALIDATION_ERROR'));
			}

			if (error instanceof ExternalAPIError) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
			}

			// 服务器错误
			return reply.status(500).send(fail('绑定打印机失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});

	/**
	 * DELETE /api/printers/:id
	 * 解绑打印机
	 *
	 * 路径参数：
	 * - id: string (必填，打印机 ID / device_name)
	 *
	 * 认证：需要用户登录
	 *
	 * 响应格式（200）：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     message: '打印机已解绑'
	 *   }
	 * }
	 */
	fastify.delete<{
		Params: {
			id: string;
		};
	}>('/api/printers/:id', { schema: unbindPrinterSchema }, async (request, reply) => {
		try {
			// 第 1 步：认证检查（提取用户 ID）
			const userId = getUserIdFromRequest(request);

			// 第 2 步：提取 Authorization Token
			const token = getAuthTokenFromRequest(request);

			// 第 3 步：提取打印机 ID
			const { id } = request.params;

			logger.info({
				msg: '📥 收到解绑打印机请求（新版本 Route 层）',
				userId,
				id,
			});

			// 第 4 步：调用 Service 层（新版本）
			await DeviceService.unbindPrinter({
				deviceId: id,
				token,
			});

			// 第 5 步：返回成功响应（200 OK）
			return reply.send(
				success({
					message: '打印机已解绑',
				}),
			);
		} catch (error) {
			// 错误处理
			logger.error({
				msg: '❌ 解绑打印机失败（新版本 Route 层）',
				id: request.params.id,
				error: error instanceof Error ? error.message : String(error),
			});

			// ✅ 使用 instanceof 检查错误类型
			if (error instanceof UnauthenticatedError) {
				return reply.status(401).send(fail('用户未认证或缺少认证信息', 'UNAUTHENTICATED'));
			}

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, 'VALIDATION_ERROR'));
			}

			if (error instanceof ExternalAPIError) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
			}

			// 服务器错误
			return reply.status(500).send(fail('解绑打印机失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});

	/**
	 * POST /api/printers/:id/jobs
	 * 创建打印任务
	 *
	 * 路径参数：
	 * - id: string (必填，打印机 ID / device_name)
	 *
	 * 请求体：
	 * - fileName: string (必填，文件名称)
	 * - gcodeUrl: string (必填，G-code 文件 URL)
	 *
	 * 认证：需要用户登录
	 *
	 * 响应格式（201）：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     job: {
	 *       id: 'job-123',
	 *       name: 'model.glb',
	 *       status: 'queued',
	 *       createdAt: '2026-01-31T10:00:00Z'
	 *     }
	 *   }
	 * }
	 */
	fastify.post<{
		Params: {
			id: string;
		};
		Body: {
			fileName: string;
			gcodeUrl: string;
		};
	}>('/api/printers/:id/jobs', { schema: createPrintJobSchema }, async (request, reply) => {
		try {
			// 第 1 步：认证检查（提取用户 ID）
			const userId = getUserIdFromRequest(request);

			// 第 2 步：提取 Authorization Token
			const token = getAuthTokenFromRequest(request);

			// 第 3 步：提取路径参数和请求体
			const { id } = request.params;
			const { fileName, gcodeUrl } = request.body;

			logger.info({
				msg: '📥 收到创建打印任务请求（新版本 Route 层）',
				userId,
				printerId: id,
				fileName,
			});

			// 第 4 步：调用 Service 层
			await DeviceService.createPrintTask({
				userId,
				deviceName: id,
				fileName,
				gcodeUrl,
				token,
			});

			// 第 5 步：返回成功响应（201 Created）
			// 注意：这里返回的是简化的 job 信息
			return reply.status(201).send(
				success({
					job: {
						id: `job-${Date.now()}`, // 临时 ID（外部服务未返回）
						name: fileName,
						status: 'queued',
						createdAt: new Date().toISOString(),
					},
				}),
			);
		} catch (error) {
			// 错误处理
			logger.error({
				msg: '❌ 创建打印任务失败（新版本 Route 层）',
				printerId: request.params.id,
				body: request.body,
				error: error instanceof Error ? error.message : String(error),
			});

			// ✅ 使用 instanceof 检查错误类型
			if (error instanceof UnauthenticatedError) {
				return reply.status(401).send(fail('用户未认证或缺少认证信息', 'UNAUTHENTICATED'));
			}

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, 'VALIDATION_ERROR'));
			}

			if (error instanceof ExternalAPIError) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
			}

			// 服务器错误
			return reply.status(500).send(fail('创建打印任务失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});
}
