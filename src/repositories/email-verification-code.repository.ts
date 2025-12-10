/**
 * EmailVerificationCode Repository - 邮箱验证码数据访问层
 */

import { db } from '@/db/drizzle';
import {
	type EmailVerificationCode,
	type NewEmailVerificationCode,
	emailVerificationCodes,
} from '@/db/schema';
import { and, desc, eq, gt } from 'drizzle-orm';

/**
 * 查找有效的验证码
 */
export async function findValidCode(
	email: string,
	code: string,
): Promise<EmailVerificationCode | null> {
	const now = new Date();
	const result = await db
		.select()
		.from(emailVerificationCodes)
		.where(
			and(
				eq(emailVerificationCodes.email, email),
				eq(emailVerificationCodes.code, code),
				gt(emailVerificationCodes.expiresAt, now),
			),
		)
		.limit(1);

	return result[0] || null;
}

/**
 * 创建验证码
 */
export async function create(data: NewEmailVerificationCode): Promise<EmailVerificationCode> {
	await db.insert(emailVerificationCodes).values(data);

	const code = await db
		.select()
		.from(emailVerificationCodes)
		.where(eq(emailVerificationCodes.email, data.email))
		.orderBy(desc(emailVerificationCodes.createdAt))
		.limit(1);

	if (!code[0]) {
		throw new Error('创建验证码失败');
	}

	return code[0];
}

/**
 * 删除邮箱的所有验证码
 */
export async function deleteByEmail(email: string): Promise<void> {
	await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.email, email));
}

/**
 * 删除过期的验证码
 */
export async function deleteExpired(): Promise<void> {
	const now = new Date();
	await db.delete(emailVerificationCodes).where(gt(emailVerificationCodes.expiresAt, now));
}
