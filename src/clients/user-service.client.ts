/**
 * 用户服务客户端
 *
 * 职责：
 * - 统一封装所有外部用户服务 API 调用
 * - 提供类型安全的 API 接口
 * - 统一错误处理和响应格式转换
 * - 避免代码重复
 *
 * 设计原则：
 * - 使用类封装（便于依赖注入和测试）
 * - 所有方法返回 Promise
 * - 统一的错误处理
 * - 完整的日志记录
 */

import type {
  UserServiceClientConfig,
  VerifyCodeType,
  UserInfoData,
} from '../types/user-service.types.js';
import { logger } from '../utils/logger.js';

/**
 * 用户服务客户端类
 */
export class UserServiceClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly enableLogging: boolean;

  constructor(config: UserServiceClientConfig) {
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout || 10000;
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
  ): Promise<{ code: number; msg: string; data?: T }> {
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
        headers['Authorization'] = token; // token 已包含 "Bearer " 前缀
      }

      // 日志记录
      if (this.enableLogging) {
        logger.info({
          msg: '[UserServiceClient] 发送请求',
          url,
          method: options.method || 'GET',
          requiresAuth,
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

      // 解析响应
      const data = (await response.json()) as { code: number; msg: string; data?: T };

      // 日志记录
      if (this.enableLogging) {
        logger.info({
          msg: '[UserServiceClient] 收到响应',
          url,
          code: data.code,
          success: data.code === 200,
        });
      }

      return data;
    } catch (error) {
      // 错误日志
      if (this.enableLogging) {
        logger.error({
          msg: '[UserServiceClient] 请求失败',
          endpoint,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // 重新抛出错误
      throw error;
    }
  }

  // ============================================
  // 发送验证码 API
  // ============================================

  /**
   * 发送邮箱验证码
   *
   * @param email 用户邮箱
   * @param type 验证码类型（'login' | 'register' | 'modify_password'）
   * @returns 成功或失败结果
   *
   * @example
   * ```typescript
   * await userServiceClient.sendVerifyCode('user@example.com', 'login');
   * ```
   */
  async sendVerifyCode(
    email: string,
    type: VerifyCodeType,
  ): Promise<{ code: number; msg: string }> {
    return this.request<undefined>(
      '/api/v1.0/random_code',
      {
        method: 'POST',
        body: JSON.stringify({ email, type }),
      },
      false, // 不需要认证
    );
  }

  // ============================================
  // 注册 API
  // ============================================

  /**
   * 用户注册
   *
   * @param email 用户邮箱
   * @param code 邮箱验证码
   * @returns 成功或失败结果
   *
   * @example
   * ```typescript
   * await userServiceClient.register('user@example.com', 'ABC123');
   * ```
   */
  async register(
    email: string,
    code: string,
  ): Promise<{ code: number; msg: string }> {
    return this.request<undefined>(
      '/api/v1.0/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          random_code: code,
        }),
      },
      false, // 不需要认证
    );
  }

  // ============================================
  // 登录 API
  // ============================================

  /**
   * 用户登录（验证码方式）
   *
   * @param email 用户邮箱
   * @param code 邮箱验证码
   * @returns 成功时返回 Token（已包含 "Bearer " 前缀）
   *
   * @example
   * ```typescript
   * const response = await userServiceClient.login('user@example.com', 'ABC123');
   * if (response.code === 200) {
   *   const token = response.data; // "Bearer eyJhbGc..."
   * }
   * ```
   */
  async login(
    email: string,
    code: string,
  ): Promise<{ code: number; msg: string; data?: string }> {
    return this.request<string>(
      '/api/v1.0/login',
      {
        method: 'POST',
        body: JSON.stringify({
          login_type: 'code',
          email,
          random_code: code,
        }),
      },
      false, // 不需要认证
    );
  }

  // ============================================
  // 获取用户信息 API
  // ============================================

  /**
   * 获取当前登录用户信息
   *
   * @param token 认证 Token（必须包含 "Bearer " 前缀）
   * @returns 成功时返回用户信息
   *
   * @example
   * ```typescript
   * const response = await userServiceClient.getUserInfo(token);
   * if (response.code === 200) {
   *   const user = response.data;
   *   console.log(`用户ID: ${user.user_id}, 昵称: ${user.nick_name}`);
   * }
   * ```
   */
  async getUserInfo(
    token: string,
  ): Promise<{ code: number; msg: string; data?: UserInfoData }> {
    return this.request<UserInfoData>(
      '/api/v1.0/info',
      {
        method: 'GET',
      },
      true, // 需要认证
      token,
    );
  }

  // ============================================
  // 退出登录 API
  // ============================================

  /**
   * 退出登录
   *
   * @param token 认证 Token（必须包含 "Bearer " 前缀）
   * @returns 成功或失败结果
   *
   * @example
   * ```typescript
   * await userServiceClient.logout(token);
   * ```
   */
  async logout(token: string): Promise<{ code: number; msg: string }> {
    return this.request<undefined>(
      '/api/v1.0/logout',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      true, // 需要认证
      token,
    );
  }
}

// ============================================
// 默认实例（单例模式）
// ============================================

let defaultInstance: UserServiceClient | null = null;

/**
 * 获取默认的用户服务客户端实例
 * @param config 配置（首次调用时需要提供）
 * @returns UserServiceClient 实例
 */
export function getUserServiceClient(
  config?: UserServiceClientConfig,
): UserServiceClient {
  if (!defaultInstance) {
    if (!config) {
      throw new Error(
        'UserServiceClient not initialized. Please provide config on first call.',
      );
    }
    defaultInstance = new UserServiceClient(config);
  }
  return defaultInstance;
}

/**
 * 重置默认实例（主要用于测试）
 */
export function resetUserServiceClient(): void {
  defaultInstance = null;
}
