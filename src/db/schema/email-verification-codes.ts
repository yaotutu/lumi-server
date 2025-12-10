import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { index, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { users } from './users.js';

/**
 * 邮箱验证码表
 * 用于无密码登录验证
 */
export const emailVerificationCodes = mysqlTable(
	'email_verification_codes',
	{
		id: varchar('id', { length: 36 })
			.primaryKey()
			.$defaultFn(() => createId()),

		email: varchar('email', { length: 255 }).notNull(),
		code: varchar('code', { length: 10 }).notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		verifiedAt: timestamp('verified_at'),

		userId: varchar('user_id', { length: 36 }),

		createdAt: timestamp('created_at').notNull().defaultNow(),
	},
	(table) => [
		index('email_created_at_idx').on(table.email, table.createdAt),
		index('email_expires_at_idx').on(table.email, table.expiresAt),
	],
);

// 定义关系
export const emailVerificationCodesRelations = relations(emailVerificationCodes, ({ one }) => ({
	user: one(users, {
		fields: [emailVerificationCodes.userId],
		references: [users.id],
	}),
}));

export type EmailVerificationCode = typeof emailVerificationCodes.$inferSelect;
export type NewEmailVerificationCode = typeof emailVerificationCodes.$inferInsert;
