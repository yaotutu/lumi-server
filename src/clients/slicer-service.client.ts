/**
 * 切片服务客户端
 *
 * 职责：
 * - 统一封装所有外部切片服务 API 调用
 * - 提供类型安全的 API 接口
 * - 统一错误处理和响应格式转换
 * - 避免代码重复
 *
 * 设计原则：
 * - 使用类封装（便于依赖注入和测试）
 * - 所有方法返回 Promise
 * - 统一的错误处理
 * - 完整的日志记录
 *
 * 说明：
 * - 切片服务是外部独立服务（OrcaSlicer），负责将 3D 模型转换为 G-code
 * - 前期简化设计：只需要 object_url 和 file_name 两个参数
 */

import type {
	CreateSliceTaskRequest,
	CreateSliceTaskResponse,
	SlicerServiceClientConfig,
	SliceTaskStatusResponse,
} from '../types/slicer-service.types.js';
import { logger } from '../utils/logger.js';

/**
 * 切片服务客户端类
 */
export class SlicerServiceClient {
	private readonly baseUrl: string;
	private readonly timeout: number;
	private readonly enableLogging: boolean;

	constructor(config: SlicerServiceClientConfig) {
		this.baseUrl = config.baseUrl;
		this.timeout = config.timeout || 30000; // 切片服务默认 30 秒超时
		this.enableLogging = config.enableLogging !== false;
	}

	/**
	 * 统一的 API 请求函数
	 * @param endpoint API 端点
	 * @param options fetch 选项
	 * @returns 外部服务的原始响应
	 */
	private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		try {
			// 构建完整 URL
			const url = `${this.baseUrl}${endpoint}`;

			// 准备请求头
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
				...(options.headers as Record<string, string>),
			};

			// 解析请求体（如果有）
			const requestBody = options.body ? JSON.parse(options.body as string) : null;

			// 打印完整的请求报文
			if (this.enableLogging) {
				logger.info({
					msg: '📤 [SlicerServiceClient] 发送请求',
					url,
					method: options.method || 'GET',
					headers,
					body: requestBody,
				});
			}

			// 发送请求（带超时）
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.timeout);

			const response = await fetch(url, {
				...options,
				headers,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			// 解析响应体
			const responseText = await response.text();
			let responseBody: T;

			try {
				responseBody = JSON.parse(responseText) as T;
			} catch {
				// 如果解析失败，将原始文本作为响应
				responseBody = responseText as unknown as T;
			}

			// 打印完整的响应报文
			if (this.enableLogging) {
				logger.info({
					msg: '📥 [SlicerServiceClient] 收到响应',
					url,
					statusCode: response.status,
					statusText: response.statusText,
					headers: Object.fromEntries(response.headers.entries()),
					body: responseBody,
				});
			}

			// 检查 HTTP 状态码
			if (!response.ok) {
				logger.error({
					msg: '❌ [SlicerServiceClient] HTTP 错误响应',
					url,
					statusCode: response.status,
					statusText: response.statusText,
					body: responseBody,
				});
				throw new Error(`HTTP error! status: ${response.status}, body: ${responseText}`);
			}

			return responseBody;
		} catch (error) {
			// 错误日志
			if (this.enableLogging) {
				logger.error({
					msg: '❌ [SlicerServiceClient] 请求失败',
					endpoint,
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				});
			}

			// 重新抛出错误
			throw error;
		}
	}

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
		return this.request<CreateSliceTaskResponse>('/api/v1/tasks/', {
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
		return this.request<SliceTaskStatusResponse>(`/api/v1/tasks/${taskId}`, {
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
