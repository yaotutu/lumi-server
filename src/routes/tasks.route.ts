/**
 * Generation Request Routes
 * 生成请求相关的 API 路由
 */

import { config } from '@/config/index.js';
import { imageQueue } from '@/queues';
import {
	createTaskSchema,
	deleteTaskSchema,
	getPrintStatusSchema,
	getTaskSchema,
	listTasksSchema,
	selectImageSchema,
	submitPrintSchema,
} from '@/schemas/task.schema';
import * as GenerationRequestService from '@/services/generation-request.service';
import * as PromptOptimizerService from '@/services/prompt-optimizer.service';
import { sseConnectionManager } from '@/services/sse-connection-manager';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { fail, success } from '@/utils/response';
import { adaptGenerationRequest } from '@/utils/task-adapter';
import { getUserIdFromRequest } from '@/utils/request-auth';
import type { FastifyInstance } from 'fastify';

/**
 * 注册生成请求路由
 */
export async function taskRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/tasks
	 * 获取用户的生成请求列表
	 *
	 * Next.js 响应格式：
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

			// JSend success 格式 - 列表数据嵌套在 data.items 中（与 Next.js 一致）
			return reply.send(
				success({
					items: requests,
					total: requests.length,
				}),
			);
		} catch (error) {
			logger.error({ msg: '获取生成请求列表失败', error });
			return (reply as any).code(500).send(fail('获取生成请求列表失败'));
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
			optimizePrompt?: boolean;
		};
	}>('/api/tasks', { schema: createTaskSchema }, async (request, reply) => {
		try {
			const userId = getUserIdFromRequest(request);
			const { prompt, optimizePrompt = true } = request.body;

			// 验证提示词
			if (!prompt || prompt.trim().length === 0) {
				throw new ValidationError('提示词不能为空');
			}

			// 优化提示词 (可选)
			let finalPrompt = prompt.trim();
			if (optimizePrompt) {
				logger.info({ msg: '开始优化提示词', originalPrompt: prompt });
				finalPrompt = await PromptOptimizerService.optimizePromptFor3DPrint(prompt);
			}

			// ✅ 创建生成请求（自动创建 4 个 Image 和 4 个 ImageJob）
			const generationRequest = await GenerationRequestService.createRequest(userId, finalPrompt);

			// ✅ 将 4 个已创建的 ImageJob 加入 BullMQ 队列
			const imageJobs = await Promise.all(
				generationRequest.images.map(async (image) => {
					// 获取该 Image 关联的 Job（generationJob 字段）
					const job = image.generationJob;
					if (!job || !job.id) {
						throw new Error(`Image ${image.id} 没有关联的 Job`);
					}

					return imageQueue.add(`image-${image.id}`, {
						jobId: job.id, // ✅ 正确的 ImageJob ID
						imageId: image.id, // ✅ 正确的 Image ID
						prompt: finalPrompt,
						requestId: generationRequest.id,
						userId,
					});
				}),
			);

			logger.info({
				msg: '✅ 生成请求创建成功，已加入队列',
				requestId: generationRequest.id,
				imageCount: generationRequest.images.length,
				jobCount: imageJobs.length,
			});

			// JSend success 格式 - 直接返回 generationRequest（与 Next.js 一致）
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

			return reply.send(
				success({
					model: result.model,
					selectedImageIndex: result.selectedImageIndex,
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
	fastify.delete<{ Params: { id: string } }>('/api/tasks/:id', { schema: deleteTaskSchema }, async (request, reply) => {
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
	});

	/**
	 * POST /api/tasks/:id/print
	 * 提交打印任务
	 */
	fastify.post<{ Params: { id: string } }>('/api/tasks/:id/print', { schema: submitPrintSchema }, async (request, reply) => {
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
	});

	/**
	 * GET /api/tasks/:id/print-status
	 * 查询打印状态
	 */
	fastify.get<{ Params: { id: string } }>('/api/tasks/:id/print-status', { schema: getPrintStatusSchema }, async (request, reply) => {
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
	});

	/**
	 * GET /api/tasks/:id/events
	 * SSE (Server-Sent Events) 实时任务状态推送
	 *
	 * 事件类型：
	 * - image:generating - 图片开始生成
	 * - image:completed - 图片生成完成（包含 imageUrl）
	 * - image:failed - 图片生成失败
	 * - model:generating - 模型开始生成
	 * - model:progress - 模型生成进度更新（包含 progress 0-100）
	 * - model:completed - 模型生成完成（包含 modelUrl）
	 * - model:failed - 模型生成失败
	 * - task:init - 任务初始状态（连接建立后立即发送）
	 */
	fastify.get<{ Params: { id: string } }>('/api/tasks/:id/events', async (request, reply) => {
		const { id: taskId } = request.params;

		// 从认证中间件获取用户信息
		const userId = getUserIdFromRequest(request);

		logger.info({ msg: '建立 SSE 连接', taskId, userId });

		// 获取请求的 Origin
		const origin = request.headers.origin as string;

		// 检查 Origin 是否在白名单中
		const allowedOrigin = config.cors.origins.includes(origin) ? origin : config.cors.origins[0];

		// 设置 SSE 响应头 (包含 CORS 头)
		reply.raw.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no', // 禁用 Nginx 缓冲
			// ✅ CORS 头 (SSE 必须手动添加)
			'Access-Control-Allow-Origin': allowedOrigin,
			'Access-Control-Allow-Credentials': 'true',
		});

		// 刷新响应头，确保客户端立即收到
		reply.raw.flushHeaders();

		// 存储心跳定时器
		let heartbeatInterval: NodeJS.Timeout | undefined;
		let connection: ReturnType<typeof sseConnectionManager.addConnection> | undefined;

		try {
			// 添加到连接管理器
			connection = sseConnectionManager.addConnection(taskId, reply);

			// 1. 发送初始状态
			logger.info({ msg: '发送任务初始状态', taskId });

			try {
				// 查询任务详情
				const generationRequest = await GenerationRequestService.getRequestById(taskId);

				logger.info({ msg: '📊 查询到任务数据', taskId, data: generationRequest });

				// 适配为前端格式
				const taskData = adaptGenerationRequest(generationRequest);

				logger.info({ msg: '✅ 适配后的任务数据', taskId, data: taskData });

				// 发送初始状态事件
				reply.raw.write(`event: task:init\ndata: ${JSON.stringify(taskData)}\n\n`);

				logger.info({ msg: '📡 已发送 task:init 事件', taskId });
			} catch (error) {
				logger.error({ msg: '查询任务详情失败', error, taskId });
				// 发送错误事件
				reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: '任务不存在或已删除' })}\n\n`);
				// 关闭连接
				reply.raw.end();
				sseConnectionManager.removeConnection(connection);
				return;
			}

			// 2. 设置心跳定时器（每 30 秒）
			heartbeatInterval = setInterval(() => {
				try {
					sseConnectionManager.sendHeartbeat(connection!);
				} catch (error) {
					logger.error({ msg: '心跳发送失败，清理连接', error, taskId });
					clearInterval(heartbeatInterval);
				}
			}, 30000);

			// 3. 监听客户端断开
			request.raw.on('close', () => {
				logger.info({ msg: '客户端主动断开 SSE 连接', taskId });
				if (heartbeatInterval) {
					clearInterval(heartbeatInterval);
				}
				if (connection) {
					sseConnectionManager.removeConnection(connection);
				}
			});

			// 保持连接打开，不调用 reply.send()
		} catch (error) {
			logger.error({ msg: 'SSE 流初始化异常', error, taskId });
			if (heartbeatInterval) {
				clearInterval(heartbeatInterval);
			}
			if (connection) {
				sseConnectionManager.removeConnection(connection);
			}
			if (!reply.sent) {
				reply.raw.end();
			}
		}
	});
}
