/**
 * Auth Service - 认证服务层
 *
 * 职责:
 * - 验证码生成和验证
 * - 用户登录/登出
 * - Session 管理
 *
 * @note 临时方案：验证码固定为 "0000"，待对接独立邮件系统
 */

import { createId } from '@paralleldrive/cuid2';
import * as userRepository from '@/repositories/user.repository';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * 生成4位数字验证码
 *
 * @deprecated 临时写死为 "0000"，待对接独立邮件系统后移除
 */
function _generateVerificationCode(): string {
	// 临时方案：写死验证码为 "0000"
	// TODO: 后期对接独立邮件系统后恢复随机生成
	return '0000';
	// return Math.floor(1000 + Math.random() * 9000).toString();
}

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

	// 临时方案：不再保存验证码到数据库
	// 固定验证码为 "0000"
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
 * @returns 用户信息
 *
 * @note 临时方案：验证码固定为 "0000"，不验证数据库
 * @todo 后期对接独立邮件系统后恢复数据库验证
 */
export async function verifyCodeAndLogin(email: string, code: string) {
	// 临时方案：验证码固定为 "0000"
	if (code !== '0000') {
		throw new ValidationError('验证码无效或已过期');
	}

	// TODO: 后期对接独立邮件系统后，恢复数据库验证逻辑
	// const verificationCode = await emailVerificationCodeRepository.findValidCode(email, code);
	// if (!verificationCode) {
	// 	throw new ValidationError('验证码无效或已过期');
	// }

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

	logger.info({
		msg: '✅ 用户登录成功（使用固定验证码0000）',
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
