import { createId } from '@paralleldrive/cuid2';
import { mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

/**
 * 用户表
 * 存储用户基本信息和登录状态
 */
export const users = mysqlTable('users', {
	// 主键使用 CUID2 (与 Prisma 的 cuid() 兼容)
	id: varchar('id', { length: 36 })
		.primaryKey()
		.$defaultFn(() => createId()),

	// 基本信息
	email: varchar('email', { length: 255 }).notNull().unique(),
	name: varchar('name', { length: 255 }),
	avatar: varchar('avatar', { length: 500 }),

	// 时间戳
	lastLoginAt: timestamp('last_login_at'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at')
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
