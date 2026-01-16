/**
 * 外部服务客户端基础类型定义
 *
 * 用途：
 * - 为所有外部服务客户端提供统一的配置接口
 * - 支持 BaseServiceClient 及其子类的实例化配置
 */

/**
 * 基础服务客户端配置接口
 *
 * @property baseUrl - 外部服务的基础 URL（必填）
 * @property timeout - HTTP 请求超时时间（毫秒）（可选，默认 30000ms）
 * @property enableLogging - 是否启用请求/响应日志（可选，默认 true）
 *
 * @example
 * ```typescript
 * const config: BaseServiceClientConfig = {
 *   baseUrl: 'http://user.ai3d.top',
 *   timeout: 10000,
 *   enableLogging: true,
 * };
 * ```
 */
export interface BaseServiceClientConfig {
	/** 外部服务的基础 URL（如 http://user.ai3d.top） */
	baseUrl: string;

	/** HTTP 请求超时时间（毫秒），默认 30000ms（30 秒） */
	timeout?: number;

	/** 是否启用请求/响应日志，默认 true（开发环境建议启用） */
	enableLogging?: boolean;
}
