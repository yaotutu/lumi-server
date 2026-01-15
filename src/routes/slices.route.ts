/**
 * Slice Routes
 * 切片相关的 API 路由
 */

import type { FastifyInstance } from 'fastify';
import { getSlicerServiceClient } from '@/clients/slicer-service.client.js';
import { config } from '@/config/index.js';
import { modelRepository } from '@/repositories/index.js';
import { createSliceSchema, getSliceStatusSchema } from '@/schemas/routes/slices.schema.js';
import { ValidationError } from '@/utils/errors.js';
import { logger } from '@/utils/logger.js';
import { getUserIdFromRequest } from '@/utils/request-auth.js';
import { fail, success } from '@/utils/response.js';

/**
 * 注册切片路由
 */
export async function slicesRoutes(fastify: FastifyInstance) {
	/**
	 * POST /api/slices
	 * 创建切片任务（一键切片）
	 *
	 * 请求体：
	 * {
	 *   modelId: string  // 3D 模型 ID
	 * }
	 *
	 * 响应格式（201）：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     modelId: string,
	 *     sliceTaskId: string,
	 *     sliceStatus: 'PROCESSING',
	 *     message: '切片任务已创建，正在处理中'
	 *   }
	 * }
	 */
	fastify.post<{
		Body: {
			modelId: string;
		};
	}>('/api/slices', { schema: createSliceSchema }, async (request, reply) => {
		try {
			// 第 1 步：获取用户 ID（认证）
			const userId = getUserIdFromRequest(request);
			const { modelId } = request.body;

			logger.info({
				msg: '📥 收到创建切片任务请求',
				modelId,
				userId,
			});

			// 第 2 步：验证模型存在且属于当前用户
			const model = await modelRepository.findById(modelId);
			if (!model) {
				logger.warn({
					msg: '⚠️ 模型不存在',
					modelId,
					userId,
				});
				return reply.status(404).send(fail('模型不存在', 'MODEL_NOT_FOUND'));
			}

			// 检查模型所有权
			if (model.externalUserId !== userId) {
				logger.warn({
					msg: '⚠️ 无权访问该模型',
					modelId,
					userId,
					modelOwner: model.externalUserId,
				});
				return reply.status(403).send(fail('无权访问该模型', 'FORBIDDEN'));
			}

			// 第 3 步：检查模型是否已生成完成
			if (!model.modelUrl) {
				logger.warn({
					msg: '⚠️ 模型尚未生成完成',
					modelId,
				});
				return reply.status(400).send(fail('模型尚未生成完成，无法进行切片', 'MODEL_NOT_READY'));
			}

			// 第 4 步：检查是否已有切片任务（防止重复提交）
			if (model.sliceStatus && model.sliceStatus !== 'FAILED') {
				logger.warn({
					msg: '⚠️ 切片任务已存在',
					modelId,
					currentStatus: model.sliceStatus,
				});
				return reply
					.status(400)
					.send(
						fail(`切片任务已存在，当前状态：${model.sliceStatus}`, 'SLICE_TASK_ALREADY_EXISTS'),
					);
			}

			// 第 5 步：初始化切片服务客户端
			const slicerClient = getSlicerServiceClient({
				baseUrl: config.slicerService.url,
				timeout: config.slicerService.timeout,
			});

			// 第 6 步：从代理 URL 中提取原始模型 URL
			const fileName = `${modelId}.${model.format?.toLowerCase() || 'obj'}`;

			// 从代理 URL 中提取原始 URL
			// model.modelUrl 格式: /api/proxy/model?url=https%3A%2F%2F...
			// 需要提取 url 参数并解码，得到原始的 COS URL
			let objectUrl: string;

			// 优先检查是否是代理 URL（无论是完整 URL 还是相对路径）
			if (model.modelUrl.includes('/api/proxy/model?url=')) {
				// 是代理 URL，提取原始 URL
				const urlMatch = model.modelUrl.match(/[?&]url=([^&]+)/);
				if (urlMatch) {
					objectUrl = decodeURIComponent(urlMatch[1]);
					logger.info({
						msg: '✅ 从代理 URL 中提取原始 URL',
						proxyUrl: model.modelUrl,
						extractedUrl: objectUrl,
					});
				} else {
					throw new Error('无法从代理 URL 中提取原始 URL');
				}
			} else if (model.modelUrl.startsWith('https://')) {
				// 已经是 HTTPS URL，直接使用
				objectUrl = model.modelUrl;
				logger.info({
					msg: '✅ 使用原始 HTTPS URL',
					url: objectUrl,
				});
			} else {
				// 其他情况，抛出错误
				throw new Error(`不支持的 modelUrl 格式: ${model.modelUrl}`);
			}

			logger.info({
				msg: '🎨 调用外部切片服务创建任务',
				originalModelUrl: model.modelUrl,
				extractedObjectUrl: objectUrl,
				fileName,
				slicerServiceUrl: config.slicerService.url,
			});

			// 第 7 步：同步调用外部服务创建切片任务
			let sliceTaskId: string;
			try {
				const createResponse = await slicerClient.createSliceTask({
					object_url: objectUrl,
					file_name: fileName,
				});

				sliceTaskId = createResponse.slice_task_id;

				logger.info({
					msg: '✅ 切片任务已在外部服务创建',
					sliceTaskId,
					status: createResponse.status,
					message: createResponse.message,
				});
			} catch (error) {
				logger.error({
					msg: '❌ 调用外部切片服务失败',
					modelId,
					error: error instanceof Error ? error.message : String(error),
				});

				return reply
					.status(502)
					.send(fail('切片服务暂时不可用，请稍后重试', 'EXTERNAL_SERVICE_ERROR'));
			}

			// 第 8 步：保存切片任务 ID 和状态到数据库
			await modelRepository.update(modelId, {
				sliceTaskId,
				sliceStatus: 'PROCESSING', // 已创建，等待处理中
				gcodeUrl: null, // 清空旧的结果
				gcodeMetadata: null,
			});

			logger.info({
				msg: '✅ 切片任务已创建完成',
				modelId,
				sliceTaskId,
			});

			// 第 9 步：返回成功响应（201 Created）
			return reply.status(201).send(
				success({
					modelId,
					sliceTaskId, // ✅ 返回任务 ID 给前端
					sliceStatus: 'PROCESSING',
					message: '切片任务已创建，正在处理中',
				}),
			);
		} catch (error) {
			logger.error({
				msg: '❌ 创建切片任务失败',
				modelId: request.body.modelId,
				error: error instanceof Error ? error.message : String(error),
			});

			// 认证错误
			if (error instanceof Error && error.message.includes('未认证')) {
				return reply.status(401).send(fail('请先登录', 'UNAUTHORIZED'));
			}

			// 验证错误
			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, 'VALIDATION_ERROR'));
			}

			// 服务器错误
			return reply.status(500).send(fail('创建切片任务失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});

	/**
	 * GET /api/slices/:sliceTaskId
	 * 查询切片任务状态
	 *
	 * 响应格式（200）：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     sliceTaskId: string,
	 *     status: 'PENDING' | 'FETCHING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
	 *     progress: number,
	 *     gcodeUrl: string | null,
	 *     gcodeMetadata: object | null,
	 *     errorMessage: string | null
	 *   }
	 * }
	 */
	fastify.get<{
		Params: {
			sliceTaskId: string;
		};
	}>('/api/slices/:sliceTaskId', { schema: getSliceStatusSchema }, async (request, reply) => {
		try {
			const { sliceTaskId } = request.params;

			logger.info({
				msg: '📥 收到查询切片任务状态请求',
				sliceTaskId,
			});

			// 第 1 步：初始化切片服务客户端
			const slicerClient = getSlicerServiceClient({
				baseUrl: config.slicerService.url,
				timeout: config.slicerService.timeout,
			});

			// 第 2 步：调用外部服务查询状态
			let statusResponse;
			try {
				statusResponse = await slicerClient.getSliceTaskStatus(sliceTaskId);

				logger.info({
					msg: '✅ 查询到切片任务状态',
					sliceTaskId,
					status: statusResponse.status,
					progress: statusResponse.progress,
				});
			} catch (error) {
				logger.error({
					msg: '❌ 调用外部切片服务失败',
					sliceTaskId,
					error: error instanceof Error ? error.message : String(error),
				});

				return reply
					.status(502)
					.send(fail('切片服务暂时不可用，请稍后重试', 'EXTERNAL_SERVICE_ERROR'));
			}

			// 第 3 步：从数据库查询模型信息
			const model = await modelRepository.findBySliceTaskId(sliceTaskId);
			if (!model) {
				logger.warn({
					msg: '⚠️ 数据库中未找到对应的模型',
					sliceTaskId,
				});
				return reply.status(404).send(fail('切片任务不存在', 'SLICE_TASK_NOT_FOUND'));
			}

			// 第 4 步：如果切片完成，更新数据库（可选，用于缓存结果）
			if (statusResponse.status === 'COMPLETED' && statusResponse.gcode_download_url) {
				if (model.sliceStatus !== 'COMPLETED') {
					// 只在状态不是 COMPLETED 时更新（避免重复更新）
					await modelRepository.update(model.id, {
						sliceStatus: 'COMPLETED',
						gcodeUrl: statusResponse.gcode_download_url,
						gcodeMetadata: statusResponse.gcode_metadata || null,
					});

					logger.info({
						msg: '✅ 切片完成，已更新数据库',
						modelId: model.id,
						sliceTaskId,
					});
				}
			}

			// 第 5 步：返回完整的响应数据（符合 Schema 定义）
			return reply.send(
				success({
					sliceTaskId: statusResponse.id,
					modelId: model.id, // ✅ 从数据库获取
					sliceStatus: statusResponse.status as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED', // ✅ 映射为 sliceStatus
					gcodeUrl: statusResponse.gcode_download_url || null,
					gcodeMetadata: statusResponse.gcode_metadata || null,
					errorMessage: statusResponse.error_message || null,
					updatedAt: model.updatedAt.toISOString(), // ✅ 从数据库获取
				}),
			);
		} catch (error) {
			logger.error({
				msg: '❌ 查询切片任务状态失败',
				sliceTaskId: request.params.sliceTaskId,
				error: error instanceof Error ? error.message : String(error),
			});

			// 服务器错误
			return reply
				.status(500)
				.send(fail('查询切片任务状态失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});
}
