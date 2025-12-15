/**
 * User Repository - 用户数据访问层
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { type NewUser, type User, users } from '@/db/schema';

/**
 * 根据邮箱查找用户
 */
export async function findByEmail(email: string): Promise<User | null> {
	const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
	return result[0] || null;
}

/**
 * 根据ID查找用户
 */
export async function findById(id: string): Promise<User | null> {
	const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
	return result[0] || null;
}

/**
 * 创建新用户
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
 * 更新用户信息
 */
export async function update(
	id: string,
	data: Partial<Omit<User, 'id' | 'createdAt'>>,
): Promise<User> {
	await db.update(users).set(data).where(eq(users.id, id));
	const user = await findById(id);
	if (!user) {
		throw new Error('用户不存在');
	}
	return user;
}

/**
 * 删除用户
 */
export async function deleteUser(id: string): Promise<void> {
	await db.delete(users).where(eq(users.id, id));
}
