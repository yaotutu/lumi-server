/**
 * Auth Service - 认证服务层
 *
 * 职责:
 * - 验证码生成和验证（临时方案）
 * - 用户信息获取和构建
 *
 * @note 临时方案：验证码固定为 "0000"，待对接独立邮件系统
 * @deprecated 用户管理已迁移到外部服务，本文件保留仅用于验证码功能
 */

import { getUserServiceClient } from '@/clients/user-service.client';
import config from '@/config/index';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import * as UserStatsService from './user-stats.service.js';

/**
 * 发送验证码
 *
 * @param email 邮箱地址
 * @returns 验证码(开发环境返回,生产环境不返回)
 *
 * @note 临时方案：验证码固定为 "0000"，不发送邮件
 * @todo 后期对接独立邮件系统
 */
export async function sendVerificationCode(email: string): Promise<{ code?: string }> {
	// 验证邮箱格式
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(email)) {
		throw new ValidationError('邮箱格式不正确');
	}

	// 临时方案：固定验证码为 "0000"
	const code = '0000';

	// TODO: 后期对接独立邮件系统后，发送真实验证码邮件
	// await sendEmail(email, '登录验证码', `您的验证码是: ${code}, 10分钟内有效`);

	logger.info({
		msg: '✅ 验证码已生成（临时固定为0000）',
		email,
		code,
	});

	// 始终返回验证码（因为是固定的）
	return { code };
}

/**
 * 验证码登录
 *
 * @param email 邮箱地址
 * @param code 验证码
 * @returns 用户邮箱
 *
 * @note 临时方案：验证码固定为 "0000"，不验证数据库
 * @note 用户管理已迁移到外部服务，此函数仅验证验证码
 * @todo 后期对接独立邮件系统后恢复完整验证
 */
export async function verifyCodeAndLogin(email: string, code: string) {
	// 临时方案：验证码固定为 "0000"
	if (code !== '0000') {
		throw new ValidationError('验证码无效或已过期');
	}

	logger.info({
		msg: '✅ 验证码验证成功（使用固定验证码0000）',
		email,
	});

	// 返回邮箱，由调用方决定如何处理（如调用外部用户服务）
	return { email };
}

/**
 * 获取当前用户信息（从 auth.route.ts 搬运过来的逻辑）
 * 包含用户基本信息和统计数据
 *
 * @param authHeader Authorization header (Bearer token)
 * @returns 用户资料对象，包含状态、用户信息和统计数据
 */
export async function getUserProfile(authHeader: string | undefined): Promise<{
	status: 'authenticated' | 'unauthenticated' | 'error';
	user: Record<string, unknown> | null;
}> {
	try {
		// 👇 从 Router 搬运的逻辑（原封不动）
		if (!authHeader) {
			return {
				status: 'unauthenticated',
				user: null,
			};
		}

		// 初始化 UserServiceClient
		const userClient = getUserServiceClient({
			baseUrl: config.userService.url,
			timeout: 10000,
		});

		// 使用 UserServiceClient 获取用户信息
		const response = await userClient.getUserInfo(authHeader);

		if (response.code === 200 && response.data) {
			// 构建 user 对象，只包含必需字段
			const userData: Record<string, unknown> = {
				id: response.data.user_id,
				userName: response.data.user_name,
				nickName: response.data.nick_name,
			};

			// 添加可选字段（仅在存在时）
			if (response.data.email) {
				userData.email = response.data.email;
			}
			if (response.data.avatar !== undefined) {
				userData.avatar = response.data.avatar || null;
			}
			if (response.data.gender) {
				userData.gender = response.data.gender;
			}

			// 获取用户统计数据
			// 如果统计数据查询失败，使用默认值（全部为 0）
			let stats = null;
			try {
				stats = await UserStatsService.getUserStats(response.data.user_id);
			} catch (statsError) {
				// 统计数据查询失败时，记录警告日志，但不影响用户基本信息的返回
				logger.warn({
					msg: '获取用户统计数据失败，使用默认值',
					userId: response.data.user_id,
					error: statsError,
				});
				// 使用默认统计数据（全部为 0）
				stats = {
					totalModels: 0,
					publicModels: 0,
					privateModels: 0,
					totalLikes: 0,
					totalFavorites: 0,
					totalViews: 0,
					totalDownloads: 0,
					likedModelsCount: 0,
					favoritedModelsCount: 0,
					totalRequests: 0,
					completedRequests: 0,
					failedRequests: 0,
				};
			}

			// 将统计数据添加到用户对象中
			userData.stats = stats;

			return {
				status: 'authenticated',
				user: userData,
			};
		}

		return {
			status: 'unauthenticated',
			user: null,
		};
	} catch (error) {
		logger.error({ msg: '获取用户信息失败', error });
		// 注意：即使出错，也返回对象（不抛出异常）
		// 通过 status: 'error' 字段告知调用方发生了错误
		return {
			status: 'error',
			user: null,
		};
	}
}
