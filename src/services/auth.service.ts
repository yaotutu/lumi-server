/**
 * Auth Service - 认证服务层
 *
 * 职责:
 * - 验证码生成和验证
 * - 用户登录/登出
 * - Session 管理
 */

import * as emailVerificationCodeRepository from '@/repositories/email-verification-code.repository';
import * as userRepository from '@/repositories/user.repository';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { createId } from '@paralleldrive/cuid2';

/**
 * 生成4位数字验证码
 */
function generateVerificationCode(): string {
	return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * 发送验证码
 *
 * @param email 邮箱地址
 * @returns 验证码(开发环境返回,生产环境不返回)
 */
export async function sendVerificationCode(email: string): Promise<{ code?: string }> {
	// 验证邮箱格式
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(email)) {
		throw new ValidationError('邮箱格式不正确');
	}

	// 删除该邮箱的所有旧验证码
	await emailVerificationCodeRepository.deleteByEmail(email);

	// 生成验证码
	const code = generateVerificationCode();
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10分钟过期

	// 保存验证码
	await emailVerificationCodeRepository.create({
		id: createId(),
		email,
		code,
		expiresAt,
	});

	// TODO: 发送邮件
	// await sendEmail(email, '登录验证码', `您的验证码是: ${code}, 10分钟内有效`);

	logger.info({
		msg: '✅ 验证码已生成',
		email,
		code: process.env.NODE_ENV === 'development' ? code : '****',
	});

	// 开发环境返回验证码(方便测试)
	if (process.env.NODE_ENV === 'development') {
		return { code };
	}

	return {};
}

/**
 * 验证码登录
 *
 * @param email 邮箱地址
 * @param code 验证码
 * @returns 用户信息
 */
export async function verifyCodeAndLogin(email: string, code: string) {
	// 验证验证码
	const verificationCode = await emailVerificationCodeRepository.findValidCode(email, code);

	if (!verificationCode) {
		throw new ValidationError('验证码无效或已过期');
	}

	// 查找或创建用户
	let user = await userRepository.findByEmail(email);

	if (!user) {
		// 创建新用户
		user = await userRepository.createUser({
			id: createId(),
			email,
			name: email.split('@')[0], // 默认用户名为邮箱前缀
		});

		logger.info({
			msg: '✅ 新用户注册',
			userId: user.id,
			email: user.email,
		});
	}

	// 删除已使用的验证码
	await emailVerificationCodeRepository.deleteByEmail(email);

	logger.info({
		msg: '✅ 用户登录成功',
		userId: user.id,
		email: user.email,
	});

	return user;
}

/**
 * 根据用户ID获取用户信息
 *
 * @param userId 用户ID
 * @returns 用户信息或null
 */
export async function getUserById(userId: string) {
	return userRepository.findById(userId);
}

/**
 * 更新用户信息
 *
 * @param userId 用户ID
 * @param data 更新数据
 * @returns 更新后的用户信息
 */
export async function updateUser(userId: string, data: { name?: string; avatar?: string }) {
	return userRepository.update(userId, data);
}
