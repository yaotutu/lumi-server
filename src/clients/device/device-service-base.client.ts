/**
 * Device 服务基类（中间层）
 *
 * 职责：
 * - 继承 BaseServiceClient（复用 HTTP 逻辑）
 * - 处理 Device 服务的响应格式 `{ code, msg, data, total? }`
 * - 验证 code 字段（200 表示成功）
 * - 处理认证错误（code === 401）
 * - 解包 data 字段
 * - 提供两种请求方法：
 *   1. deviceRequest<T>() - 标准格式（只有 data）
 *   2. deviceRequestPaginated<T>() - 分页格式（data + total）
 *
 * 不包含：
 * - 具体业务接口方法（由子类 DeviceServiceClient 实现）
 *
 * 继承关系：
 * BaseServiceClient → DeviceServiceBaseClient → DeviceServiceClient
 */

import { BaseServiceClient } from '@/clients/base/base-service.client.js';
import { ExternalAPIError, UnauthenticatedError } from '@/utils/errors.js';

/**
 * Device 服务抽象基类（中间层）
 *
 * 所有 Device 服务客户端都应该继承这个类。
 * 提供了 Device 服务响应格式的统一处理逻辑。
 */
export abstract class DeviceServiceBaseClient extends BaseServiceClient {
	/**
	 * Device 服务标准请求方法（protected，仅供子类使用）
	 *
	 * 用于处理标准响应格式：`{ code, msg, data }`
	 *
	 * 职责：
	 * 1. 调用父类的 request() 方法发送请求
	 * 2. 验证响应的 code 字段
	 * 3. 如果 code === 401，抛出 UnauthenticatedError
	 * 4. 如果 code !== 200，抛出 ExternalAPIError
	 * 5. 返回解包后的 data 字段
	 *
	 * @param endpoint - API 端点（相对路径，如 '/api/v1.0/status'）
	 * @param options - fetch 选项（method, body, headers 等）
	 * @param token - Bearer Token（必填，Device 服务需要认证）
	 * @returns 解包后的业务数据（类型 T）
	 *
	 * @throws UnauthenticatedError 当 code === 401 时（认证失败）
	 * @throws ExternalAPIError 当 code !== 200 时（业务错误）
	 *
	 * @example
	 * ```typescript
	 * // 子类调用示例
	 * const deviceInfo = await this.deviceRequest<{ id: string; name: string }>(
	 *   '/api/v1.0/device/123',
	 *   { method: 'GET' },
	 *   token
	 * );
	 * ```
	 */
	protected async deviceRequest<T>(
		endpoint: string,
		options: RequestInit = {},
		token: string,
	): Promise<T> {
		// 调用父类的通用 request 方法（处理 HTTP 请求）
		const response = await this.request<{
			code: number;
			msg: string;
			data: T;
		}>(endpoint, options, token);

		// Device 服务特定逻辑：验证 code 字段
		if (response.code !== 200) {
			// 特殊处理：认证错误（401）
			if (response.code === 401) {
				throw new UnauthenticatedError('Device 服务认证失败');
			}

			// 其他业务错误
			throw new ExternalAPIError(`Device 服务错误: ${response.msg}`);
		}

		// 返回解包后的 data 字段
		return response.data;
	}

	/**
	 * Device 服务分页请求方法（protected，仅供子类使用）
	 *
	 * 用于处理分页响应格式：`{ code, msg, data: T[], total: number }`
	 *
	 * 职责：
	 * 1. 调用父类的 request() 方法发送请求
	 * 2. 验证响应的 code 字段
	 * 3. 如果 code === 401，抛出 UnauthenticatedError
	 * 4. 如果 code !== 200，抛出 ExternalAPIError
	 * 5. 验证 data 字段是数组
	 * 6. 返回解包后的 { data: T[], total: number }
	 *
	 * @param endpoint - API 端点（相对路径，如 '/api/v1.0/products'）
	 * @param options - fetch 选项（method, body, headers 等）
	 * @param token - Bearer Token（必填，Device 服务需要认证）
	 * @returns 解包后的分页数据 `{ data: T[], total: number }`
	 *
	 * @throws UnauthenticatedError 当 code === 401 时（认证失败）
	 * @throws ExternalAPIError 当 code !== 200 或 data 不是数组时（业务错误）
	 *
	 * @example
	 * ```typescript
	 * // 子类调用示例
	 * const { data: products, total } = await this.deviceRequestPaginated<Product>(
	 *   '/api/v1.0/products?page=0&size=10',
	 *   { method: 'GET' },
	 *   token
	 * );
	 * console.log(`总计: ${total} 条，返回: ${products.length} 条`);
	 * ```
	 */
	protected async deviceRequestPaginated<T>(
		endpoint: string,
		options: RequestInit = {},
		token: string,
	): Promise<{ data: T[]; total: number }> {
		// 调用父类的通用 request 方法（处理 HTTP 请求）
		const response = await this.request<{
			code: number;
			msg: string;
			data: T[];
			total: number;
		}>(endpoint, options, token);

		// Device 服务特定逻辑：验证 code 字段
		if (response.code !== 200) {
			// 特殊处理：认证错误（401）
			if (response.code === 401) {
				throw new UnauthenticatedError('Device 服务认证失败');
			}

			// 其他业务错误
			throw new ExternalAPIError(`Device 服务错误: ${response.msg}`);
		}

		// 验证 data 字段是数组
		if (!response.data || !Array.isArray(response.data)) {
			throw new ExternalAPIError('Device 服务响应格式错误：data 字段缺失或非数组');
		}

		// 返回解包后的 { data, total }
		return {
			data: response.data,
			total: response.total,
		};
	}
}
