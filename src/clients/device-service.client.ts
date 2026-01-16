/**
 * Device 服务客户端
 *
 * 职责：
 * - 统一封装所有外部 Device 服务 API 调用
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
 * - Device 服务是外部独立服务，负责管理 3D 打印机设备和产品信息
 * - 本实现仅封装产品查询接口，后续可扩展设备管理、任务管理等功能
 */

import type {
	DeviceServiceClientConfig,
	GetProductsRequest,
	GetProductsResponse,
} from '../types/device-service.types.js';
import { logger } from '../utils/logger.js';

/**
 * Device 服务客户端类
 */
export class DeviceServiceClient {
	private readonly baseUrl: string;
	private readonly timeout: number;
	private readonly enableLogging: boolean;

	constructor(config: DeviceServiceClientConfig) {
		this.baseUrl = config.baseUrl;
		this.timeout = config.timeout || 30000; // Device 服务默认 30 秒超时
		this.enableLogging = config.enableLogging !== false;
	}

	/**
	 * 统一的 API 请求函数
	 * @param endpoint API 端点
	 * @param options fetch 选项
	 * @param requiresAuth 是否需要认证（自动添加 Token）
	 * @param token 认证 Token（如果需要认证）
	 * @returns 外部服务的原始响应
	 */
	private async request<T>(
		endpoint: string,
		options: RequestInit = {},
		requiresAuth = false,
		token?: string,
	): Promise<T> {
		try {
			// 构建完整 URL
			const url = `${this.baseUrl}${endpoint}`;

			// 准备请求头
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
				...(options.headers as Record<string, string>),
			};

			// 如果需要认证，添加 Token
			if (requiresAuth && token) {
				headers.Authorization = token; // token 已包含 "Bearer " 前缀
			}

			// 解析请求体（如果有）
			const requestBody = options.body ? JSON.parse(options.body as string) : null;

			// 准备日志用的请求头（脱敏处理）
			const loggableHeaders = { ...headers };
			if (loggableHeaders.Authorization) {
				// 只显示 Token 的前 20 个字符，避免泄露完整 Token
				const tokenValue = loggableHeaders.Authorization;
				loggableHeaders.Authorization = `${tokenValue.substring(0, 20)}...***`;
			}

			// 打印完整的请求报文
			if (this.enableLogging) {
				logger.info({
					msg: '📤 [DeviceServiceClient] 发送请求',
					url,
					method: options.method || 'GET',
					headers: loggableHeaders,
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
					msg: '📥 [DeviceServiceClient] 收到响应',
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
					msg: '❌ [DeviceServiceClient] HTTP 错误响应',
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
					msg: '❌ [DeviceServiceClient] 请求失败',
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
	// 查询产品列表 API
	// ============================================

	/**
	 * 查询产品列表
	 *
	 * @param params 查询参数（page, size, keyword）
	 * @param token 认证 Token（用户的 Bearer Token）
	 * @returns 产品列表响应
	 *
	 * @example
	 * ```typescript
	 * const response = await deviceClient.getProducts({
	 *   page: 0,
	 *   size: 10,
	 *   keyword: 'printer'
	 * }, 'Bearer xxx');
	 * console.log(`总计: ${response.total} 条，返回: ${response.data.length} 条`);
	 * ```
	 */
	async getProducts(params: GetProductsRequest, token: string): Promise<GetProductsResponse> {
		// 构建查询字符串
		const queryParams = new URLSearchParams({
			page: String(params.page),
			size: String(params.size),
		});

		// 添加可选的 keyword 参数
		if (params.keyword) {
			queryParams.set('keyword', params.keyword);
		}

		const endpoint = `/api/v1.0/product?${queryParams.toString()}`;
		return this.request<GetProductsResponse>(
			endpoint,
			{ method: 'GET' },
			true, // 需要认证
			token, // 传递 Token
		);
	}
}

// ============================================
// 默认实例（单例模式）
// ============================================

let defaultInstance: DeviceServiceClient | null = null;

/**
 * 获取默认的 Device 服务客户端实例
 * @param config 配置（首次调用时需要提供）
 * @returns DeviceServiceClient 实例
 */
export function getDeviceServiceClient(config?: DeviceServiceClientConfig): DeviceServiceClient {
	if (!defaultInstance) {
		if (!config) {
			throw new Error('DeviceServiceClient not initialized. Please provide config on first call.');
		}
		defaultInstance = new DeviceServiceClient(config);
	}
	return defaultInstance;
}

/**
 * 重置默认实例（主要用于测试）
 */
export function resetDeviceServiceClient(): void {
	defaultInstance = null;
}
