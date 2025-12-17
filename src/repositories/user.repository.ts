/**
 * User Repository - 用户数据访问层
 * 职责：管理外部用户ID与本地用户ID的映射关系
 *
 * 设计理念：极简化，不缓存用户信息
 */

import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { type NewUser, type User, users } from '@/db/schema';
import type { ExternalUser } from '@/services/external-user.service';

/**
 * 根据ID查找用户
 */
export async function findById(id: string): Promise<User | null> {
	const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
	return result[0] || null;
}

/**
 * 通过外部用户ID查找本地用户
 * @param externalUserId 外部用户ID
 */
export async function findByExternalUserId(externalUserId: string): Promise<User | null> {
	const result = await db
		.select()
		.from(users)
		.where(eq(users.externalUserId, externalUserId))
		.limit(1);
	return result[0] || null;
}

/**
 * 创建新用户（仅创建映射关系）
 */
export async function createUser(data: NewUser): Promise<User> {
	await db.insert(users).values(data);
	if (!data.id) {
		throw new Error('用户ID不能为空');
	}
	const user = await findById(data.id);
	if (!user) {
		throw new Error('创建用户失败');
	}
	return user;
}

/**
 * 从外部用户信息创建本地映射记录
 * @param externalUser 外部用户信息
 */
export async function createFromExternalUser(externalUser: ExternalUser): Promise<User> {
	const newUser: NewUser = {
		id: createId(),
		externalUserId: externalUser.user_id,
	};

	const userId = newUser.id;
	if (!userId) {
		throw new Error('生成用户ID失败');
	}

	await db.insert(users).values(newUser);

	const user = await findById(userId);
	if (!user) {
		throw new Error('创建用户失败');
	}
	return user;
}

/**
 * 删除用户
 */
export async function deleteUser(id: string): Promise<void> {
	await db.delete(users).where(eq(users.id, id));
}

