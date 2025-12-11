/**
 * Worker 状态路由
 * 返回图片和 3D 模型生成队列的运行状态
 *
 * 参考：/Users/yaotutu/Desktop/code/lumi-web-next/app/api/workers/status/route.ts
 */

import { imageQueue, modelQueue } from '@/queues';
import { success } from '@/utils/response';
import type { FastifyInstance } from 'fastify';

/**
 * 注册 Worker 状态路由
 */
export async function workerRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/workers/status
	 * 返回所有 Worker 的运行状态
	 *
	 * Next.js 响应格式：
	 * {
	 *   status: 'success',
	 *   data: {
	 *     image: { isRunning, processingCount, processingJobIds, config },
	 *     model3d: { isRunning, processingCount, processingJobIds, config }
	 *   }
	 * }
	 */
	fastify.get('/api/workers/status', async (_request, reply) => {
		try {
			// 获取队列状态（BullMQ）
			const [imageWaiting, imageActive, model3dWaiting, model3dActive] = await Promise.all([
				imageQueue.getWaitingCount(),
				imageQueue.getActiveCount(),
				modelQueue.getWaitingCount(),
				modelQueue.getActiveCount(),
			]);

			// 获取正在处理的任务 ID
			const [imageActiveJobs, model3dActiveJobs] = await Promise.all([
				imageQueue.getActive(),
				modelQueue.getActive(),
			]);

			// 构建与 Next.js 兼容的响应格式
			const imageStatus = {
				isRunning: imageActive > 0 || imageWaiting > 0,
				processingCount: imageActive,
				processingJobIds: imageActiveJobs.map((job) => job.id).filter((id): id is string => !!id),
				config: {
					queueName: 'image-generation',
					waitingCount: imageWaiting,
					activeCount: imageActive,
				},
			};

			const model3dStatus = {
				isRunning: model3dActive > 0 || model3dWaiting > 0,
				processingCount: model3dActive,
				processingJobIds: model3dActiveJobs.map((job) => job.id).filter((id): id is string => !!id),
				config: {
					queueName: 'model3d-generation',
					waitingCount: model3dWaiting,
					activeCount: model3dActive,
				},
			};

			// JSend success 格式（与 Next.js 一致）
			return reply.send(
				success({
					image: imageStatus,
					model3d: model3dStatus,
				}),
			);
		} catch (error) {
			// 如果队列未初始化，返回默认状态
			return reply.send(
				success({
					image: {
						isRunning: false,
						processingCount: 0,
						processingJobIds: [],
						config: null,
					},
					model3d: {
						isRunning: false,
						processingCount: 0,
						processingJobIds: [],
						config: null,
					},
				}),
			);
		}
	});
}
