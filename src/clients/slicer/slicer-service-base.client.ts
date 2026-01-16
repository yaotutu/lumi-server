/**
 * Slicer 服务基类（中间层）
 *
 * 职责：
 * - 继承 BaseServiceClient，复用 HTTP 通信逻辑
 * - 提供 slicerRequest 方法供业务层调用
 * - 不需要特殊的响应格式处理（Slicer 服务直接返回数据对象）
 *
 * 说明：
 * - Slicer 服务不使用 JSend 格式，直接返回数据对象
 * - HTTP 错误由 BaseServiceClient 统一处理
 * - 未来如需特殊处理，可在此类中扩展
 */

import { BaseServiceClient } from '@/clients/base/base-service.client.js';
import { ExternalAPIError } from '@/utils/errors.js';

/**
 * Slicer 服务基类
 *
 * 响应格式：直接返回数据对象（不使用 JSend 包装）
 * 示例：{ slice_task_id: string, status: string, message: string }
 */
export abstract class SlicerServiceBaseClient extends BaseServiceClient {
	/**
	 * Slicer 服务专用请求方法
	 *
	 * @param endpoint - API 端点（相对路径）
	 * @param options - fetch 选项
	 * @returns 解析后的响应数据
	 *
	 * 说明：
	 * - Slicer 服务不需要认证（不传 token 参数）
	 * - HTTP 错误由父类 BaseServiceClient 统一处理
	 * - 直接返回响应数据，不做额外处理
	 */
	protected async slicerRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		try {
			// 调用父类的通用 request 方法
			// 父类已处理：超时控制、日志记录、HTTP 状态码检查
			return await this.request<T>(endpoint, options);
		} catch (error) {
			// 如果不是已知错误类型，包装为 ExternalAPIError
			if (error instanceof Error) {
				throw new ExternalAPIError(`Slicer 服务错误: ${error.message}`, 'SlicerService');
			}
			throw error;
		}
	}
}
