/**
 * Generation Request Routes
 * 生成请求相关的 API 路由
 */

import type { FastifyInstance } from 'fastify';
import {
	createTaskSchema,
	deleteTaskSchema,
	getPrintStatusSchema,
	getTaskSchema,
	getTaskStatusSchema,
	listTasksSchema,
	selectImageSchema,
	submitPrintSchema,
} from '@/schemas/routes/tasks.schema';
import * as GenerationRequestService from '@/services/generation-request.service';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { getUserIdFromRequest } from '@/utils/request-auth';
import { fail, success } from '@/utils/response';

/**
 * 注册生成请求路由
 */
export async function taskRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/tasks
	 * 获取用户的生成请求列表
	 *
	 * 响应格式：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     items: GenerationRequest[],  // 包含 images 和 model
	 *     total: number
	 *   }
	 * }
	 */
	fastify.get('/api/tasks', { schema: listTasksSchema }, async (request, reply) => {
		try {
			// 从认证中间件获取用户信息
			const userId = getUserIdFromRequest(request);

			const query = request.query as { limit?: string };
			const limit = Number.parseInt(query.limit || '20', 10);

			const requests = await GenerationRequestService.listRequests(userId, { limit });

			// JSend success 格式 - 列表数据嵌套在 data.items 中
			return reply.send(
				success({
					items: requests,
					total: requests.length,
				}),
			);
		} catch (error) {
			// 检查是否是认证错误
			if (error instanceof Error && error.message.includes('未认证')) {
				return reply.code(401).send(fail('请先登录', 'UNAUTHORIZED'));
			}

			logger.error({ msg: '获取生成请求列表失败', error });
			return reply.code(500).send(fail('获取生成请求列表失败'));
		}
	});

	/**
	 * GET /api/tasks/:id
	 * 获取生成请求详情
	 */
	fastify.get<{ Params: { id: string } }>(
		'/api/tasks/:id',
		{ schema: getTaskSchema },
		async (request, reply) => {
			try {
				const { id } = request.params;

				const generationRequest = await GenerationRequestService.getRequestById(id);

				return reply.send(success(generationRequest));
			} catch (error) {
				logger.error({ msg: '获取生成请求详情失败', error, requestId: request.params.id });

				if (error instanceof Error && error.message.includes('不存在')) {
					return reply.status(404).send(fail(error.message));
				}

				return reply.code(500).send(fail('获取生成请求详情失败'));
			}
		},
	);

	/**
	 * POST /api/tasks
	 * 创建新的生成请求
	 */
	fastify.post<{
		Body: {
			prompt: string;
		};
	}>('/api/tasks', { schema: createTaskSchema }, async (request, reply) => {
		try {
			const userId = getUserIdFromRequest(request);
			const { prompt } = request.body;

			// 验证提示词
			if (!prompt || prompt.trim().length === 0) {
				throw new ValidationError('提示词不能为空');
			}

			// ✅ 创建生成请求（快速返回，不等待 LLM 和队列）
			const generationRequest = await GenerationRequestService.createRequest(userId, prompt.trim());

			// ✅ 使用 setImmediate 触发后台异步处理（生成提示词 + 加入队列）
			setImmediate(() => {
				GenerationRequestService.processPromptAndEnqueueJobs(
					generationRequest.id,
					prompt.trim(),
					userId,
				);
			});

			logger.info({
				msg: '✅ 生成请求创建成功，后台任务已触发',
				requestId: generationRequest.id,
				imageCount: generationRequest.images.length,
			});

			// JSend success 格式 - 立即返回 generationRequest（此时 imagePrompt 为 null，后续异步填充）
			return reply.status(201).send(success(generationRequest));
		} catch (error) {
			logger.error({ msg: '创建生成请求失败', error });

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message));
			}

			return reply.code(500).send(fail('创建生成请求失败'));
		}
	});

	/**
	 * PATCH /api/tasks/:id
	 * 选择图片触发3D模型生成
	 */
	fastify.patch<{
		Params: { id: string };
		Body: { selectedImageIndex: number };
	}>('/api/tasks/:id', { schema: selectImageSchema }, async (request, reply) => {
		try {
			const { id } = request.params;
			const { selectedImageIndex } = request.body;

			// 验证参数
			if (selectedImageIndex === undefined || selectedImageIndex < 0 || selectedImageIndex > 3) {
				throw new ValidationError('selectedImageIndex 必须在 0-3 之间');
			}

			// 选择图片并触发3D生成
			const result = await GenerationRequestService.selectImageAndGenerateModel(
				id,
				selectedImageIndex,
			);

			logger.info({
				msg: '✅ 已选择图片并触发3D模型生成',
				requestId: id,
				selectedImageIndex,
				modelId: result.model?.id,
			});

			// 重新查询完整的 task 对象（包含更新后的状态）
			const updatedTask = await GenerationRequestService.getRequestById(id);

			return reply.send(
				success({
					task: updatedTask,
					model: result.model,
				}),
			);
		} catch (error) {
			logger.error({ msg: '选择图片触发3D生成失败', error, requestId: request.params.id });

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message));
			}

			if (error instanceof Error && error.message.includes('不存在')) {
				return reply.status(404).send(fail(error.message));
			}

			return reply.code(500).send(fail('选择图片触发3D生成失败'));
		}
	});

	/**
	 * DELETE /api/tasks/:id
	 * 删除生成请求
	 */
	fastify.delete<{ Params: { id: string } }>(
		'/api/tasks/:id',
		{ schema: deleteTaskSchema },
		async (request, reply) => {
			try {
				const { id } = request.params;

				await GenerationRequestService.deleteRequest(id);

				logger.info({ msg: '✅ 生成请求删除成功', requestId: id });

				return reply.send(success({ message: '生成请求已删除' }));
			} catch (error) {
				logger.error({ msg: '删除生成请求失败', error, requestId: request.params.id });

				if (error instanceof Error && error.message.includes('不存在')) {
					return reply.status(404).send(fail(error.message));
				}

				if (error instanceof Error && error.message.includes('无权限')) {
					return reply.status(403).send(fail(error.message));
				}

				return reply.code(500).send(fail('删除生成请求失败'));
			}
		},
	);

	/**
	 * POST /api/tasks/:id/print
	 * 提交打印任务
	 */
	fastify.post<{ Params: { id: string } }>(
		'/api/tasks/:id/print',
		{ schema: submitPrintSchema },
		async (request, reply) => {
			try {
				const { id } = request.params;
				const userId = getUserIdFromRequest(request);

				// 提交打印任务
				const result = await GenerationRequestService.submitPrintTask(id, userId);

				logger.info({
					msg: '✅ 打印任务提交成功',
					requestId: id,
					modelId: result.modelId,
					sliceTaskId: result.sliceTaskId,
				});

				return reply.send(
					success({
						sliceTaskId: result.sliceTaskId,
						printResult: result.printResult,
						message: '打印任务已提交',
					}),
				);
			} catch (error) {
				logger.error({ msg: '提交打印任务失败', error, requestId: request.params.id });

				if (error instanceof ValidationError) {
					return reply.status(400).send(fail(error.message));
				}

				if (error instanceof Error && error.message.includes('不存在')) {
					return reply.status(404).send(fail(error.message));
				}

				return reply.code(500).send(fail('提交打印任务失败'));
			}
		},
	);

	/**
	 * GET /api/tasks/:id/print-status
	 * 查询打印状态
	 */
	fastify.get<{ Params: { id: string } }>(
		'/api/tasks/:id/print-status',
		{ schema: getPrintStatusSchema },
		async (request, reply) => {
			try {
				const { id } = request.params;

				// 查询打印状态
				const result = await GenerationRequestService.getPrintStatus(id);

				return reply.send(
					success({
						printStatus: result.printStatus,
						sliceTaskId: result.sliceTaskId,
						progress: result.progress,
					}),
				);
			} catch (error) {
				logger.error({ msg: '查询打印状态失败', error, requestId: request.params.id });

				if (error instanceof Error && error.message.includes('不存在')) {
					return reply.status(404).send(fail(error.message));
				}

				return reply.code(500).send(fail('查询打印状态失败'));
			}
		},
	);

	/**
	 * GET /api/tasks/:id/status
	 * 轮询获取任务状态（替代 SSE）
	 *
	 * 支持条件查询：
	 * - 传递 since 参数（上次查询的 updatedAt）
	 * - 如果数据未更新，返回 304 Not Modified，减少网络流量
	 */
	fastify.get<{
		Params: { id: string };
		Querystring: { since?: string };
	}>('/api/tasks/:id/status', { schema: getTaskStatusSchema }, async (request, reply) => {
		const { id } = request.params;
		const { since } = request.query;

		try {
			// 查询任务详情（包含 images 和 model）
			const task = await GenerationRequestService.getRequestById(id);

			// 优化：如果数据未更新，返回 304 Not Modified
			if (since) {
				const sinceDate = new Date(since);
				const taskUpdatedAt = new Date(task.updatedAt);

				if (taskUpdatedAt <= sinceDate) {
					// 数据未更新，返回 304
					return reply.code(304).send();
				}
			}

			// 设置缓存头（禁用缓存，确保每次都查询最新数据）
			reply.header('Cache-Control', 'no-cache, must-revalidate');

			// 返回完整任务数据（与 GET /api/tasks/:id 相同的格式）
			return reply.send(success(task));
		} catch (error) {
			logger.error({ msg: '查询任务状态失败（轮询）', error, taskId: id });

			if (error instanceof Error && error.message.includes('不存在')) {
				return reply.code(404).send(fail('任务不存在'));
			}

			return reply.code(500).send(fail('查询任务状态失败'));
		}
	});
}
