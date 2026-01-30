/**
 * 用户服务客户端（业务层）
 *
 * 职责：
 * - 提供 User 服务的具体业务接口方法
 * - 调用中间层 UserServiceBaseClient 的方法
 * - 格式转换（snake_case → camelCase）
 *
 * 不包含：
 * - HTTP 请求逻辑（由 BaseServiceClient 处理）
 * - 响应格式验证（由 UserServiceBaseClient 处理）
 * - 错误处理（由 UserServiceBaseClient 处理）
 *
 * 继承关系：
 * BaseServiceClient → UserServiceBaseClient → UserServiceClient
 */

import type {
	UserInfoData,
	UserServiceClientConfig,
	VerifyCodeType,
} from '@/types/user-service.types.js';
import { UserServiceBaseClient } from './user-service-base.client.js';

/**
 * 用户服务客户端类
 *
 * 继承 UserServiceBaseClient，复用响应格式处理逻辑。
 */
export class UserServiceClient extends UserServiceBaseClient {
	// ============================================
	// 发送验证码 API
	// ============================================

	/**
	 * 发送邮箱验证码
	 *
	 * @param email 用户邮箱
	 * @param type 验证码类型（'login' | 'register' | 'modify_password'）
	 * @returns 成功消息
	 */
	async sendVerifyCode(email: string, type: VerifyCodeType): Promise<{ message: string }> {
		// 注意：此接口不需要认证，不传 token
		// 直接调用父类 request（不经过 userRequest，因为不需要 token）
		const response = await this.request<{
			code: number;
			msg: string;
		}>('/api/v1.0/random_code', {
			method: 'POST',
			body: JSON.stringify({ email, type }),
		});

		// 手动验证 code（因为没有使用 userRequest）
		if (response.code !== 200) {
			throw new Error(`发送验证码失败: ${response.msg}`);
		}

		return { message: response.msg || '验证码已发送' };
	}

	// ============================================
	// 注册 API
	// ============================================

	/**
	 * 用户注册
	 *
	 * @param email 用户邮箱
	 * @param code 邮箱验证码
	 * @returns 成功消息
	 */
	async register(email: string, code: string): Promise<{ message: string }> {
		// 注意：此接口不需要认证
		const response = await this.request<{
			code: number;
			msg: string;
		}>('/api/v1.0/register', {
			method: 'POST',
			body: JSON.stringify({
				email,
				random_code: code,
			}),
		});

		// 手动验证 code
		if (response.code !== 200) {
			throw new Error(`注册失败: ${response.msg}`);
		}

		return { message: response.msg || '注册成功' };
	}

	// ============================================
	// 登录 API
	// ============================================

	/**
	 * 用户登录（验证码方式）
	 *
	 * @param email 用户邮箱
	 * @param code 邮箱验证码
	 * @returns Token（已包含 "Bearer " 前缀）
	 */
	async login(email: string, code: string): Promise<string> {
		// 注意：此接口不需要认证
		const response = await this.request<{
			code: number;
			msg: string;
			data: string;
		}>('/api/v1.0/login', {
			method: 'POST',
			body: JSON.stringify({
				login_type: 'code',
				email,
				random_code: code,
			}),
		});

		// 手动验证 code
		if (response.code !== 200) {
			throw new Error(`登录失败: ${response.msg}`);
		}

		if (!response.data) {
			throw new Error('登录失败：未返回 Token');
		}

		return response.data;
	}

	// ============================================
	// 获取用户信息 API
	// ============================================

	/**
	 * 获取当前登录用户信息
	 *
	 * @param token 认证 Token（必须包含 "Bearer " 前缀）
	 * @returns 用户信息
	 */
	async getUserInfo(token: string): Promise<UserInfoData> {
		// 调用中间层的 userRequest 方法
		// 中间层会自动处理：
		// - HTTP 请求发送
		// - code 字段验证
		// - 认证错误处理
		// - 解包 data
		return this.userRequest<UserInfoData>('/api/v1.0/info', { method: 'GET' }, token);
	}

	// ============================================
	// 退出登录 API
	// ============================================

	/**
	 * 退出登录
	 *
	 * @param token 认证 Token（必须包含 "Bearer " 前缀）
	 * @returns 成功消息
	 */
	async logout(token: string): Promise<{ message: string }> {
		// 调用中间层的 userRequest 方法
		// 注意：此接口返回 undefined，但需要包装成 { message }
		await this.userRequest<undefined>(
			'/api/v1.0/logout',
			{
				method: 'POST',
				body: JSON.stringify({}),
			},
			token,
		);

		return { message: '退出登录成功' };
	}

	// ============================================
	// 获取指定用户信息 API
	// ============================================

	/**
	 * 获取指定用户信息
	 *
	 * @param userId 用户ID
	 * @param token 认证 Token（必须包含 "Bearer " 前缀）
	 * @returns 用户信息
	 */
	async getUserById(userId: string, token: string): Promise<UserInfoData> {
		// 调用中间层的 userRequest 方法
		return this.userRequest<UserInfoData>(`/api/v1.0/${userId}`, { method: 'GET' }, token);
	}

	// ============================================
	// 更新用户信息 API
	// ============================================

	/**
	 * 更新用户信息
	 *
	 * @param userId 用户ID
	 * @param updateData 更新数据（昵称、头像、性别）
	 * @param token 认证 Token（必须包含 "Bearer " 前缀）
	 * @returns 成功消息
	 */
	async updateUser(
		userId: string,
		updateData: {
			nick_name?: string;
			avatar?: string;
			gender?: string;
		},
		token: string,
	): Promise<{ message: string }> {
		// 调用中间层的 userRequest 方法
		// 注意：此接口返回 undefined，但需要包装成 { message }
		await this.userRequest<undefined>(
			'/api/v1.0/update',
			{
				method: 'POST',
				body: JSON.stringify({
					id: userId,
					...updateData,
				}),
			},
			token,
		);

		return { message: '更新成功' };
	}

	// ============================================
	// 修改密码 API
	// ============================================

	/**
	 * 修改密码
	 *
	 * @param userId 用户ID
	 * @param passwordData 密码数据
	 * @param token 认证 Token（必须包含 "Bearer " 前缀）
	 * @returns 成功消息
	 */
	async modifyPassword(
		userId: string,
		passwordData: {
			old_password?: string;
			new_password: string;
			repassword: string;
			random_code: string;
		},
		token: string,
	): Promise<{ message: string }> {
		// 调用中间层的 userRequest 方法
		await this.userRequest<undefined>(
			'/api/v1.0/modify_password',
			{
				method: 'POST',
				body: JSON.stringify({
					id: userId,
					...passwordData,
				}),
			},
			token,
		);

		return { message: '修改密码成功' };
	}
}

// ============================================
// 默认实例（单例模式）
// ============================================

let defaultInstance: UserServiceClient | null = null;

/**
 * 获取默认的用户服务客户端实例
 *
 * @param config 配置（首次调用时需要提供）
 * @returns UserServiceClient 实例
 */
export function getUserServiceClient(config?: UserServiceClientConfig): UserServiceClient {
	if (!defaultInstance) {
		if (!config) {
			throw new Error('UserServiceClient not initialized. Please provide config on first call.');
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
