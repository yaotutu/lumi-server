/**
 * Worker 状态查询 API
 * 返回图片和 3D 模型生成队列的运行状态
 */

import type { FastifyInstance } from 'fastify';
import { getWorkersStatusSchema } from '@/schemas/routes/workers.schema';
import * as WorkerStatusService from '@/services/worker-status.service';
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
			// ✅ 调用 Service 获取 Workers 状态（已重构到 Service 层）
			const result = await WorkerStatusService.getWorkersStatus();

			// JSend success 格式
			return reply.send(success(result));
		},
	);
}
