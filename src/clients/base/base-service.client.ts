/**
 * 外部服务客户端基类
 *
 * 职责：
 * - 提供通用的 HTTP 请求方法（request）
 * - 处理 Token 注入到 Authorization header
 * - 超时控制（AbortController）
 * - 请求/响应日志记录（带 Token 脱敏）
 * - JSON 响应解析
 *
 * 不包含：
 * - 响应格式验证（由子类中间层处理）
 * - 业务错误处理（由子类中间层处理）
 * - 业务接口方法（由子类业务层实现）
 *
 * 继承关系：
 * BaseServiceClient → Service-Specific Base → Business Client
 * 例如：BaseServiceClient → UserServiceBaseClient → UserServiceClient
 */

import { logger } from '@/utils/logger.js';
import type { BaseServiceClientConfig } from './types.js';

/**
 * 外部服务客户端抽象基类
 *
 * 所有外部服务客户端的通用 HTTP 逻辑都在这里实现。
 * 子类只需要继承并实现特定的响应格式处理逻辑。
 */
export abstract class BaseServiceClient {
	/** 外部服务的基础 URL */
	protected readonly baseUrl: string;

	/** HTTP 请求超时时间（毫秒） */
	protected readonly timeout: number;

	/** 是否启用请求/响应日志 */
	protected readonly enableLogging: boolean;

	/**
	 * 构造函数
	 *
	 * @param config - 基础配置对象
	 */
	constructor(config: BaseServiceClientConfig) {
		this.baseUrl = config.baseUrl;
		// 默认超时 30 秒
		this.timeout = config.timeout || 30000;
		// 默认启用日志
		this.enableLogging = config.enableLogging !== false;
	}

	/**
	 * 通用 HTTP 请求方法（protected，仅供子类使用）
	 *
	 * 职责：
	 * 1. 构建请求头（注入 Token 如果提供）
	 * 2. 记录请求日志（Token 脱敏）
	 * 3. 发送 HTTP 请求（带超时控制）
	 * 4. 解析 JSON 响应
	 * 5. 记录响应日志
	 * 6. 返回原始响应体（不做格式验证）
	 *
	 * @param endpoint - API 端点（相对路径，如 '/api/v1.0/info'）
	 * @param options - fetch 选项（method, body, headers 等）
	 * @param token - 可选的 Bearer Token（如果提供，会注入到 Authorization header）
	 * @returns 原始响应体（类型 T 由调用者指定）
	 *
	 * @throws Error 当网络请求失败或超时时（HTTP 状态码错误由子类处理）
	 *
	 * @example
	 * ```typescript
	 * // 子类调用示例（不带 Token）
	 * const response = await this.request<{ status: string }>('/api/health', { method: 'GET' });
	 *
	 * // 子类调用示例（带 Token）
	 * const response = await this.request<{ code: number; data: any }>(
	 *   '/api/v1.0/info',
	 *   { method: 'GET' },
	 *   'Bearer xxx'
	 * );
	 * ```
	 */
	protected async request<T>(
		endpoint: string,
		options: RequestInit = {},
		token?: string,
	): Promise<T> {
		// 完整的请求 URL（baseUrl + endpoint）
		const url = `${this.baseUrl}${endpoint}`;

		// 第 1 步：构建请求头（注入 Token 如果提供）
		const headers = this.buildHeaders(options.headers, token);

		// 第 2 步：记录请求日志（Token 脱敏）
		if (this.enableLogging) {
			this.logRequest(url, options.method || 'GET', headers, options.body);
		}

		// 第 3 步：发送 HTTP 请求（带超时控制）
		const response = await this.fetchWithTimeout(url, { ...options, headers });

		// 第 4 步：解析 JSON 响应
		const body = await this.parseResponse<T>(response);

		// 第 5 步：记录响应日志
		if (this.enableLogging) {
			this.logResponse(url, response.status, body);
		}

		// 第 6 步：HTTP 错误检查（仅检查网络层错误，业务错误由子类处理）
		if (!response.ok) {
			// 网络层错误（4xx/5xx）
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		// 返回原始响应体（不做格式验证）
		return body;
	}

	/**
	 * 构建请求头（私有方法）
	 *
	 * @param customHeaders - 自定义请求头（可选）
	 * @param token - Bearer Token（可选）
	 * @returns 完整的请求头对象
	 */
	private buildHeaders(
		customHeaders?: RequestInit['headers'],
		token?: string,
	): Record<string, string> {
		// 基础请求头（Content-Type）
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			// 合并自定义请求头
			...(customHeaders as Record<string, string>),
		};

		// 如果提供了 Token，注入到 Authorization header
		if (token) {
			// 注意：token 应该已经包含 "Bearer " 前缀
			headers.Authorization = token;
		}

		return headers;
	}

	/**
	 * Token 脱敏（私有方法）
	 *
	 * 用于日志记录时隐藏 Token 的敏感部分。
	 *
	 * @param headers - 原始请求头
	 * @returns 脱敏后的请求头（Authorization 只保留前 20 个字符）
	 */
	private maskAuthorizationHeader(headers: Record<string, string>): Record<string, string> {
		// 复制请求头对象（避免修改原对象）
		const masked = { ...headers };

		// 如果存在 Authorization header，进行脱敏
		if (masked.Authorization) {
			const token = masked.Authorization;
			// 只保留前 20 个字符，后面用 ...*** 替代
			masked.Authorization = `${token.substring(0, 20)}...***`;
		}

		return masked;
	}

	/**
	 * 带超时控制的 fetch（私有方法）
	 *
	 * 使用 AbortController 实现超时机制。
	 *
	 * @param url - 请求 URL
	 * @param options - fetch 选项
	 * @returns fetch 响应对象
	 *
	 * @throws Error 当请求超时时（AbortError）
	 */
	private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
		// 创建 AbortController 用于超时控制
		const controller = new AbortController();
		// 设置超时定时器
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			// 发送请求（传入 signal 用于中断）
			return await fetch(url, { ...options, signal: controller.signal });
		} finally {
			// 清除定时器（无论成功或失败）
			clearTimeout(timeoutId);
		}
	}

	/**
	 * 解析响应体（私有方法）
	 *
	 * 尝试将响应体解析为 JSON，如果失败则返回原始文本。
	 *
	 * @param response - fetch 响应对象
	 * @returns 解析后的响应体（类型 T）
	 */
	private async parseResponse<T>(response: Response): Promise<T> {
		// 读取响应体文本
		const text = await response.text();

		try {
			// 尝试解析为 JSON
			return JSON.parse(text) as T;
		} catch {
			// 如果解析失败，返回原始文本（类型转换）
			return text as unknown as T;
		}
	}

	/**
	 * 记录请求日志（私有方法）
	 *
	 * @param url - 请求 URL
	 * @param method - HTTP 方法
	 * @param headers - 请求头（会自动脱敏）
	 * @param body - 请求体（可选）
	 */
	private logRequest(
		url: string,
		method: string,
		headers: Record<string, string>,
		body?: RequestInit['body'],
	): void {
		logger.info({
			msg: `📤 [${this.constructor.name}] 发送请求`,
			url,
			method,
			// Token 脱敏
			headers: this.maskAuthorizationHeader(headers),
			// 解析 body（如果是 JSON 字符串）
			body: body ? (typeof body === 'string' ? JSON.parse(body) : body) : null,
		});
	}

	/**
	 * 记录响应日志（私有方法）
	 *
	 * @param url - 请求 URL
	 * @param status - HTTP 状态码
	 * @param body - 响应体
	 */
	private logResponse(url: string, status: number, body: unknown): void {
		logger.info({
			msg: `📥 [${this.constructor.name}] 收到响应`,
			url,
			statusCode: status,
			body,
		});
	}
}
