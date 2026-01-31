/**
 * 外部用户服务客户端
 * 职责：与 user.ai3d.top 通信，验证 Token 和获取用户信息
 *
 * 重构说明：
 * - 现在使用统一的 UserServiceClient 进行调用
 * - 保持接口不变，避免影响认证中间件
 * - 区分"Token 无效"和"外部服务故障"，提升用户体验
 */

import { getUserServiceClient } from '@/clients/user';
import { UnauthenticatedError } from '@/utils/errors.js';
import config from '@/config/index';
import { logger } from '@/utils/logger';

/**
 * 外部用户服务返回的用户信息
 */
export interface ExternalUser {
	user_id: string; // 外部用户ID
	user_name: string; // 用户名
	email: string; // 邮箱
	nick_name: string; // 昵称
	avatar: string; // 头像
	gender: string; // 性别
	created_at: number; // 创建时间（秒级时间戳）
	updated_at: number; // 更新时间（秒级时间戳）
}

/**
 * 验证 Token 并获取用户信息
 *
 * 错误处理策略：
 * - Token 无效（401）：返回 null，中间件会返回 401，前端清空 Token
 * - 外部服务故障（网络错误、5xx）：抛出异常，中间件会返回 502，前端不清空 Token
 *
 * @param token Bearer Token（已包含 "Bearer " 前缀）
 * @returns 用户信息 或 null（Token 无效）
 * @throws Error 当外部用户服务不可用时（网络错误、服务故障等）
 */
export async function verifyTokenAndGetUser(token: string): Promise<ExternalUser | null> {
	try {
		// 使用统一的 UserServiceClient
		const client = getUserServiceClient({
			baseUrl: config.userService.url,
			timeout: 10000,
		});

		// Client 中间层已处理错误验证和解包，直接返回 UserInfoData
		const userInfo = await client.getUserInfo(token);

		logger.info({
			msg: '✅ Token 验证成功',
			userId: userInfo.user_id,
			email: userInfo.email,
		});

		return userInfo as ExternalUser;
	} catch (error) {
		// ✅ 区分错误类型，提升用户体验
		if (error instanceof UnauthenticatedError) {
			// Token 无效（401），返回 null
			// 中间件会返回 401，前端会清空 Token 并弹出登录弹窗
			logger.warn({
				msg: '⚠️ Token 无效或已过期',
				error: error.message,
			});
			return null;
		}

		// ❗ 外部服务错误（网络错误、服务故障、超时等），抛出异常
		// 中间件会返回 502，前端不会清空 Token，只显示错误提示
		logger.error({
			msg: '❌ 外部用户服务不可用',
			error: error instanceof Error ? error.message : String(error),
		});
		throw new Error('用户服务暂时不可用，请稍后重试');
	}
}
