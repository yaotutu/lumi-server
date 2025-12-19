import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { index, int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { generationRequests } from './generation-requests.js';

/**
 * S3 孤儿文件表
 * 用于跟踪和清理因删除失败而产生的孤儿文件
 */
export const orphanedFiles = mysqlTable(
	'orphaned_files',
	{
		id: varchar('id', { length: 36 })
			.primaryKey()
			.$defaultFn(() => createId()),

		// S3 对象键
		s3Key: varchar('s3_key', { length: 500 }).notNull(),

		// 关联的生成请求 ID（可为空，因为有些孤儿文件可能无法追溯来源）
		requestId: varchar('request_id', { length: 36 }),

		// 重试计数
		retryCount: int('retry_count').notNull().default(0),

		// 文件状态：pending - 待清理, deleted - 已删除
		status: varchar('status', { length: 20 }).notNull().default('pending'),

		// 时间戳
		createdAt: timestamp('created_at').notNull().defaultNow(),
		lastRetryAt: timestamp('last_retry_at'),
	},
	(table) => [
		// 索引：查询待清理的文件
		index('status_retry_count_idx').on(table.status, table.retryCount),
		// 索引：按创建时间查询
		index('created_at_idx').on(table.createdAt),
		// 索引：按请求 ID 查询
		index('request_id_idx').on(table.requestId),
	],
);

// 定义关系
export const orphanedFilesRelations = relations(orphanedFiles, ({ one }) => ({
	generationRequest: one(generationRequests, {
		fields: [orphanedFiles.requestId],
		references: [generationRequests.id],
	}),
}));

export type OrphanedFile = typeof orphanedFiles.$inferSelect;
export type NewOrphanedFile = typeof orphanedFiles.$inferInsert;
