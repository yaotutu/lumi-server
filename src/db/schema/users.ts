import { createId } from '@paralleldrive/cuid2';
import { mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

/**
 * 用户表（极简映射表）
 * 职责：仅维护外部用户ID与本地用户ID的映射关系
 *
 * 设计理念：
 * - 完全依赖外部用户服务获取用户信息
 * - 本地表只存储必要的映射关系
 * - 不缓存用户信息，避免数据不一致
 */
export const users = mysqlTable('users', {
	// 本地主键（用于业务表外键关联）
	id: varchar('id', { length: 36 })
		.primaryKey()
		.$defaultFn(() => createId()),

	// 外部用户ID（唯一索引，映射关系）
	externalUserId: varchar('external_user_id', { length: 36 }).notNull().unique(),

	// 时间戳
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at')
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
