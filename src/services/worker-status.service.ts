/**
 * Worker Status Service
 * Worker 状态查询服务
 *
 * 从 workers.route.ts 搬运过来的逻辑
 */

import { imageQueue, modelQueue } from '@/queues';

/**
 * 获取所有 Worker 的运行状态
 * 从 Router 搬运的逻辑（原封不动）
 *
 * @returns Workers 状态数组
 */
export async function getWorkersStatus() {
	try {
		// 👇 从 Router 搬运的队列状态查询逻辑（原封不动）
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

		return { workers };
	} catch (_error) {
		// 如果队列未初始化，返回默认状态
		return {
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
		};
	}
}
