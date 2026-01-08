/**
 * 外部用户服务客户端
 * 职责：与 user.ai3d.top 通信，验证 Token 和获取用户信息
 *
 * 重构说明：
 * - 现在使用统一的 UserServiceClient 进行调用
 * - 保持接口不变，避免影响认证中间件
 */

import { getUserServiceClient } from '@/clients/user-service.client';
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
 * @param token Bearer Token（已包含 "Bearer " 前缀）
 * @returns 用户信息 或 null（Token 无效）
 */
export async function verifyTokenAndGetUser(token: string): Promise<ExternalUser | null> {
	try {
		// 使用统一的 UserServiceClient
		const client = getUserServiceClient({
			baseUrl: config.userService.url,
			timeout: 10000,
		});

		const response = await client.getUserInfo(token);

		// 检查响应格式：{ code: 200, msg: "success", data: { user_id, ... } }
		if (response.code === 200 && response.data) {
			logger.info({
				msg: '✅ Token 验证成功',
				userId: response.data.user_id,
				email: response.data.email,
			});
			return response.data as ExternalUser;
		}

		logger.warn({
			msg: '外部用户服务响应格式异常',
			responseCode: response.code,
			responseMsg: response.msg,
			token: `${token.substring(0, 17)}...`, // "Bearer " + 前10个字符
		});

		return null;
	} catch (error) {
		logger.error({ msg: '调用外部用户服务失败', error });
		return null;
	}
}
