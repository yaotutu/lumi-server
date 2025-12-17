/**
 * Auth Service - 认证服务层
 *
 * 职责:
 * - 验证码生成和验证（临时方案）
 *
 * @note 临时方案：验证码固定为 "0000"，待对接独立邮件系统
 * @deprecated 用户管理已迁移到外部服务，本文件保留仅用于验证码功能
 */

import { logger } from '@/utils/logger';
import { ValidationError } from '@/utils/errors';

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
