import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { index, mysqlTable, timestamp, unique, varchar } from 'drizzle-orm/mysql-core';
import { interactionTypeEnum } from './enums.js';
import { models } from './models.js';
import { users } from './users.js';

/**
 * 模型交互表（点赞/收藏记录）
 * 用户对模型的操作记录
 */
export const modelInteractions = mysqlTable(
	'model_interactions',
	{
		id: varchar('id', { length: 36 })
			.primaryKey()
			.$defaultFn(() => createId()),

		userId: varchar('user_id', { length: 36 }).notNull(),
		modelId: varchar('model_id', { length: 36 }).notNull(),
		type: interactionTypeEnum.notNull(),

		createdAt: timestamp('created_at').notNull().defaultNow(),
	},
	(table) => [
		unique('user_id_model_id_type_unique').on(table.userId, table.modelId, table.type),
		index('user_id_type_created_at_idx').on(table.userId, table.type, table.createdAt),
		index('model_id_type_idx').on(table.modelId, table.type),
	],
);

// 定义关系
export const modelInteractionsRelations = relations(modelInteractions, ({ one }) => ({
	user: one(users, {
		fields: [modelInteractions.userId],
		references: [users.id],
	}),
	model: one(models, {
		fields: [modelInteractions.modelId],
		references: [models.id],
	}),
}));

export type ModelInteraction = typeof modelInteractions.$inferSelect;
export type NewModelInteraction = typeof modelInteractions.$inferInsert;
