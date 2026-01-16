/**
 * 切片服务客户端（业务层）
 *
 * 职责：
 * - 提供切片服务的具体业务接口方法
 * - 调用中间层 SlicerServiceBaseClient 的方法
 *
 * 不包含：
 * - HTTP 请求逻辑（由 BaseServiceClient 处理）
 * - 错误处理（由 SlicerServiceBaseClient 处理）
 *
 * 继承关系：
 * BaseServiceClient → SlicerServiceBaseClient → SlicerServiceClient
 */

import type {
	CreateSliceTaskRequest,
	CreateSliceTaskResponse,
	SlicerServiceClientConfig,
	SliceTaskStatusResponse,
} from '@/types/slicer-service.types.js';
import { SlicerServiceBaseClient } from './slicer-service-base.client.js';

/**
 * 切片服务客户端类
 *
 * 继承 SlicerServiceBaseClient，复用 HTTP 通信逻辑。
 */
export class SlicerServiceClient extends SlicerServiceBaseClient {
	// ============================================
	// 创建切片任务 API
	// ============================================

	/**
	 * 创建切片任务
	 *
	 * @param params 切片任务参数（object_url, file_name）
	 * @returns 切片任务 ID 和状态
	 *
	 * @example
	 * ```typescript
	 * const response = await slicerClient.createSliceTask({
	 *   object_url: 'https://example.com/model.obj',
	 *   file_name: 'my-model.obj'
	 * });
	 * console.log(`任务ID: ${response.slice_task_id}, 状态: ${response.status}`);
	 * ```
	 */
	async createSliceTask(params: CreateSliceTaskRequest): Promise<CreateSliceTaskResponse> {
		return this.slicerRequest<CreateSliceTaskResponse>('/api/v1/tasks/', {
			method: 'POST',
			body: JSON.stringify(params),
		});
	}

	// ============================================
	// 查询切片任务状态 API
	// ============================================

	/**
	 * 查询切片任务状态
	 *
	 * @param taskId 切片任务 ID
	 * @returns 任务详情（状态、进度、G-code URL 等）
	 *
	 * @example
	 * ```typescript
	 * const task = await slicerClient.getSliceTaskStatus('task-123');
	 * console.log(`状态: ${task.status}, 进度: ${task.progress}%`);
	 * if (task.status === 'COMPLETED') {
	 *   console.log(`G-code URL: ${task.gcode_download_url}`);
	 * }
	 * ```
	 */
	async getSliceTaskStatus(taskId: string): Promise<SliceTaskStatusResponse> {
		return this.slicerRequest<SliceTaskStatusResponse>(`/api/v1/tasks/${taskId}`, {
			method: 'GET',
		});
	}
}

// ============================================
// 默认实例（单例模式）
// ============================================

let defaultInstance: SlicerServiceClient | null = null;

/**
 * 获取默认的切片服务客户端实例
 * @param config 配置（首次调用时需要提供）
 * @returns SlicerServiceClient 实例
 */
export function getSlicerServiceClient(config?: SlicerServiceClientConfig): SlicerServiceClient {
	if (!defaultInstance) {
		if (!config) {
			throw new Error('SlicerServiceClient not initialized. Please provide config on first call.');
		}
		defaultInstance = new SlicerServiceClient(config);
	}
	return defaultInstance;
}

/**
 * 重置默认实例（主要用于测试）
 */
export function resetSlicerServiceClient(): void {
	defaultInstance = null;
}
