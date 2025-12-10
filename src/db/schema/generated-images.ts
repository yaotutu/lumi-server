import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { index, int, mysqlTable, text, timestamp, unique, varchar } from 'drizzle-orm/mysql-core';
import { imageStatusEnum } from './enums.js';
import { generationRequests } from './generation-requests.js';

/**
 * 生成的图片表
 * 每个请求生成 4 张图片，每张图片独立管理状态
 */
export const generatedImages = mysqlTable(
	'generated_images',
	{
		id: varchar('id', { length: 36 })
			.primaryKey()
			.$defaultFn(() => createId()),

		requestId: varchar('request_id', { length: 36 }).notNull(),
		index: int('index').notNull(), // 0-3

		// 图片信息
		imageUrl: varchar('image_url', { length: 500 }),
		imagePrompt: text('image_prompt'),
		imageStatus: imageStatusEnum.notNull().default('PENDING'),

		// 时间戳
		createdAt: timestamp('created_at').notNull().defaultNow(),
		completedAt: timestamp('completed_at'),
		failedAt: timestamp('failed_at'),

		// 错误信息
		errorMessage: text('error_message'),
	},
	(table) => [
		unique('request_id_index_unique').on(table.requestId, table.index),
		index('request_id_idx').on(table.requestId),
		index('image_status_idx').on(table.imageStatus),
	],
);

// 定义关系
export const generatedImagesRelations = relations(generatedImages, ({ one }) => ({
	request: one(generationRequests, {
		fields: [generatedImages.requestId],
		references: [generationRequests.id],
	}),
	generationJob: one(imageGenerationJobs),
	model: one(models),
}));

export type GeneratedImage = typeof generatedImages.$inferSelect;
export type NewGeneratedImage = typeof generatedImages.$inferInsert;

// 导入循环依赖
import { imageGenerationJobs } from './image-generation-jobs.js';
import { models } from './models.js';
