import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { index, int, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { jobStatusEnum } from './enums';
import { generatedImages } from './generated-images';

/**
 * 图片生成任务表
 * 每个 GeneratedImage 对应一个 Job，用于 BullMQ 任务处理
 */
export const imageGenerationJobs = mysqlTable(
	'image_generation_jobs',
	{
		id: varchar('id', { length: 36 })
			.primaryKey()
			.$defaultFn(() => createId()),

		imageId: varchar('image_id', { length: 36 }).notNull().unique(),

		// 任务状态
		status: jobStatusEnum.notNull().default('PENDING'),
		priority: int('priority').notNull().default(0),
		retryCount: int('retry_count').notNull().default(0),
		maxRetries: int('max_retries').notNull().default(3),
		nextRetryAt: timestamp('next_retry_at'),
		timeoutAt: timestamp('timeout_at'),

		// Provider 信息
		providerName: varchar('provider_name', { length: 50 }),
		providerJobId: varchar('provider_job_id', { length: 255 }),

		// 时间戳
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at')
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		startedAt: timestamp('started_at'),
		completedAt: timestamp('completed_at'),
		failedAt: timestamp('failed_at'),

		// 错误信息
		errorMessage: text('error_message'),
		errorCode: varchar('error_code', { length: 50 }),
		executionDuration: int('execution_duration'), // 毫秒
	},
	(table) => [
		index('status_priority_created_at_idx').on(table.status, table.priority, table.createdAt),
		index('status_next_retry_at_idx').on(table.status, table.nextRetryAt),
	],
);

// 定义关系
export const imageGenerationJobsRelations = relations(imageGenerationJobs, ({ one }) => ({
	image: one(generatedImages, {
		fields: [imageGenerationJobs.imageId],
		references: [generatedImages.id],
	}),
}));

export type ImageGenerationJob = typeof imageGenerationJobs.$inferSelect;
export type NewImageGenerationJob = typeof imageGenerationJobs.$inferInsert;
