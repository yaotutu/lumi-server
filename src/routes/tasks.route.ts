/**
 * Generation Request Routes
 * 生成请求相关的 API 路由
 */

import { imageQueue } from '@/queues';
import * as GenerationRequestService from '@/services/generation-request.service';
import * as PromptOptimizerService from '@/services/prompt-optimizer.service';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { fail, success } from '@/utils/response';
import type { FastifyInstance } from 'fastify';

/**
 * 注册生成请求路由
 */
export async function taskRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/tasks
	 * 获取用户的生成请求列表
	 */
	fastify.get('/api/tasks', async (request, reply) => {
		try {
			// 从认证中间件获取 userId (暂时使用测试 ID)
			const userId = (request.headers['x-user-id'] as string) || 'test-user-id';

			const { limit = 20 } = request.query as { limit?: number };

			const requests = await GenerationRequestService.listRequests(userId, { limit });

			return reply.send(success(requests));
		} catch (error) {
			logger.error({ msg: '获取生成请求列表失败', error });
			return reply.status(500).send(fail('获取生成请求列表失败'));
		}
	});

	/**
	 * GET /api/tasks/:id
	 * 获取生成请求详情
	 */
	fastify.get<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
		try {
			const { id } = request.params;

			const generationRequest = await GenerationRequestService.getRequestById(id);

			return reply.send(success(generationRequest));
		} catch (error) {
			logger.error({ msg: '获取生成请求详情失败', error, requestId: request.params.id });

			if (error instanceof Error && error.message.includes('不存在')) {
				return reply.status(404).send(fail(error.message));
			}

			return reply.status(500).send(fail('获取生成请求详情失败'));
		}
	});

	/**
	 * POST /api/tasks
	 * 创建新的生成请求
	 */
	fastify.post<{
		Body: {
			prompt: string;
			optimizePrompt?: boolean;
		};
	}>('/api/tasks', async (request, reply) => {
		try {
			const userId = (request.headers['x-user-id'] as string) || 'test-user-id';
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

			// 创建生成请求
			const generationRequest = await GenerationRequestService.createRequest(userId, finalPrompt);

			// 将 4 个图片生成任务加入队列
			const imageJobs = await Promise.all(
				Array.from({ length: 4 }, async (_, index) => {
					return imageQueue.add(`image-${generationRequest.id}-${index}`, {
						jobId: generationRequest.id, // TODO: 这里应该使用 ImageJob 的 ID
						imageId: generationRequest.id, // TODO: 需要从 generatedImages 中获取
						prompt: finalPrompt,
						requestId: generationRequest.id,
						userId,
					});
				}),
			);

			logger.info({
				msg: '✅ 生成请求创建成功',
				requestId: generationRequest.id,
				jobCount: imageJobs.length,
			});

			return reply.status(201).send(
				success({
					request: generationRequest,
					message: '生成请求已创建,图片生成任务已加入队列',
				}),
			);
		} catch (error) {
			logger.error({ msg: '创建生成请求失败', error });

			if (error instanceof ValidationError) {
				return reply.status(400).send(fail(error.message));
			}

			return reply.status(500).send(fail('创建生成请求失败'));
		}
	});

	/**
	 * PATCH /api/tasks/:id
	 * 选择图片触发3D模型生成
	 */
	fastify.patch<{
		Params: { id: string };
		Body: { selectedImageIndex: number };
	}>('/api/tasks/:id', async (request, reply) => {
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

			return reply.status(500).send(fail('选择图片触发3D生成失败'));
		}
	});

	/**
	 * DELETE /api/tasks/:id
	 * 删除生成请求
	 */
	fastify.delete<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
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

			return reply.status(500).send(fail('删除生成请求失败'));
		}
	});

	/**
	 * POST /api/tasks/:id/print
	 * 提交打印任务
	 */
	fastify.post<{ Params: { id: string } }>('/api/tasks/:id/print', async (request, reply) => {
		try {
			const { id } = request.params;
			const userId = (request.headers['x-user-id'] as string) || 'test-user-id';

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

			return reply.status(500).send(fail('提交打印任务失败'));
		}
	});

	/**
	 * GET /api/tasks/:id/print-status
	 * 查询打印状态
	 */
	fastify.get<{ Params: { id: string } }>('/api/tasks/:id/print-status', async (request, reply) => {
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

			return reply.status(500).send(fail('查询打印状态失败'));
		}
	});
}
