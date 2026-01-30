/**
 * User 服务基类（中间层）
 *
 * 职责：
 * - 继承 BaseServiceClient（复用 HTTP 逻辑）
 * - 处理 User 服务的响应格式 `{ code, msg, data }`
 * - 验证 code 字段（200 表示成功）
 * - 处理认证错误（code === 401）
 * - 解包 data 字段
 *
 * 不包含：
 * - 具体业务接口方法（由子类 UserServiceClient 实现）
 *
 * 继承关系：
 * BaseServiceClient → UserServiceBaseClient → UserServiceClient
 */

import { BaseServiceClient } from '@/clients/base/base-service.client.js';
import { ExternalAPIError, UnauthenticatedError } from '@/utils/errors.js';

/**
 * User 服务抽象基类（中间层）
 *
 * 所有 User 服务客户端都应该继承这个类。
 * 提供了 User 服务响应格式的统一处理逻辑。
 */
export abstract class UserServiceBaseClient extends BaseServiceClient {
	/**
	 * User 服务专用请求方法（protected，仅供子类使用）
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
	 * @param endpoint - API 端点（相对路径，如 '/api/v1.0/info'）
	 * @param options - fetch 选项（method, body, headers 等）
	 * @param token - Bearer Token（必填，User 服务需要认证）
	 * @returns 解包后的业务数据（类型 T）
	 *
	 * @throws UnauthenticatedError 当 code === 401 时（认证失败）
	 * @throws ExternalAPIError 当 code !== 200 时（业务错误）
	 *
	 * @example
	 * ```typescript
	 * // 子类调用示例
	 * const userInfo = await this.userRequest<UserInfoData>(
	 *   '/api/v1.0/info',
	 *   { method: 'GET' },
	 *   token
	 * );
	 * ```
	 */
	protected async userRequest<T>(
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

		// User 服务特定逻辑：验证 code 字段
		if (response.code !== 200) {
			// 特殊处理：认证错误（401）
			if (response.code === 401) {
				throw new UnauthenticatedError('User 服务认证失败');
			}

			// 其他业务错误
			throw new ExternalAPIError(`User 服务错误: ${response.msg}`);
		}

		// 返回解包后的 data 字段
		return response.data;
	}
}
