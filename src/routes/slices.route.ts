/**
 * Slice Routes
 * 切片相关的 API 路由
 */

import type { FastifyInstance } from 'fastify';
import { createSliceSchema, getSliceStatusSchema } from '@/schemas/routes/slices.schema.js';
import * as SliceService from '@/services/slice.service.js';
import {
	ExternalAPIError,
	NotFoundError,
	UnauthenticatedError,
	ValidationError,
} from '@/utils/errors.js';
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

			// ✅ 调用 Service 创建切片任务（已重构到 Service 层）
			const result = await SliceService.createSliceTask(userId, modelId);

			// 返回成功响应（201 Created）
			return reply.status(201).send(success(result));
		} catch (error) {
			logger.error({
				msg: '❌ 创建切片任务失败',
				modelId: request.body.modelId,
				error: error instanceof Error ? error.message : String(error),
			});

			// ✅ 使用 instanceof 检查错误类型
			if (error instanceof UnauthenticatedError) {
				return reply.status(401).send(fail('请先登录', 'UNAUTHENTICATED'));
			}

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message, 'VALIDATION_ERROR'));
			}

			if (error instanceof NotFoundError) {
				return reply.status(404).send(fail(error.message, 'NOT_FOUND'));
			}

			if (error instanceof ExternalAPIError) {
				return reply.status(502).send(fail(error.message, 'EXTERNAL_SERVICE_ERROR'));
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

			// ✅ 调用 Service 查询切片任务状态（已重构到 Service 层）
			const result = await SliceService.getSliceTaskStatus(sliceTaskId);

			return reply.send(success(result));
		} catch (error) {
			logger.error({
				msg: '❌ 查询切片任务状态失败',
				sliceTaskId: request.params.sliceTaskId,
				error: error instanceof Error ? error.message : String(error),
			});

			// ✅ 使用 instanceof 检查错误类型
			if (error instanceof NotFoundError) {
				return reply.status(404).send(fail(error.message, 'SLICE_TASK_NOT_FOUND'));
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
				.send(fail('查询切片任务状态失败，请稍后重试', 'INTERNAL_SERVER_ERROR'));
		}
	});
}
