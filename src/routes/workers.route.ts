/**
 * Worker 状态查询 API
 * 返回图片和 3D 模型生成队列的运行状态
 */

import type { FastifyInstance } from 'fastify';
import { imageQueue, modelQueue } from '@/queues';
import { getWorkersStatusSchema } from '@/schemas/routes/workers.schema';
import { success } from '@/utils/response';

/**
 * 注册 Worker 状态路由
 */
export async function workerRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/workers/status
	 * 返回所有 Worker 的运行状态
	 *
	 * 响应格式：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     image: { isRunning, processingCount, processingJobIds, config },
	 *     model3d: { isRunning, processingCount, processingJobIds, config }
	 *   }
	 * }
	 */
	fastify.get(
		'/api/workers/status',
		{ schema: getWorkersStatusSchema },
		async (_request, reply) => {
			try {
				// 获取队列状态（BullMQ）
				const [imageWaiting, imageActive, imageCompleted, imageFailed] = await Promise.all([
					imageQueue.getWaitingCount(),
					imageQueue.getActiveCount(),
					imageQueue.getCompletedCount(),
					imageQueue.getFailedCount(),
				]);

				const [model3dWaiting, model3dActive, model3dCompleted, model3dFailed] = await Promise.all([
					modelQueue.getWaitingCount(),
					modelQueue.getActiveCount(),
					modelQueue.getCompletedCount(),
					modelQueue.getFailedCount(),
				]);

				// 构建 workers 数组格式
				const workers = [
					{
						name: 'Image Generation Worker',
						status: (imageActive > 0 ? 'running' : 'stopped') as 'running' | 'stopped' | 'error',
						queueName: 'image-generation',
						concurrency: 2, // 从配置中获取
						stats: {
							active: imageActive,
							waiting: imageWaiting,
							completed: imageCompleted,
							failed: imageFailed,
						},
					},
					{
						name: 'Model Generation Worker',
						status: (model3dActive > 0 ? 'running' : 'stopped') as 'running' | 'stopped' | 'error',
						queueName: 'model3d-generation',
						concurrency: 1, // 从配置中获取
						stats: {
							active: model3dActive,
							waiting: model3dWaiting,
							completed: model3dCompleted,
							failed: model3dFailed,
						},
					},
				];

				// JSend success 格式
				return reply.send(
					success({
						workers,
					}),
				);
			} catch (_error) {
				// 如果队列未初始化，返回默认状态
				return reply.send(
					success({
						workers: [
							{
								name: 'Image Generation Worker',
								status: 'stopped' as const,
								queueName: 'image-generation',
								concurrency: 2,
								stats: {
									active: 0,
									waiting: 0,
									completed: 0,
									failed: 0,
								},
							},
							{
								name: 'Model Generation Worker',
								status: 'stopped' as const,
								queueName: 'model3d-generation',
								concurrency: 1,
								stats: {
									active: 0,
									waiting: 0,
									completed: 0,
									failed: 0,
								},
							},
						],
					}),
				);
			}
		},
	);
}
