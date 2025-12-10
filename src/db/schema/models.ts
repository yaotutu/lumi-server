import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { index, int, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { modelSourceEnum, modelVisibilityEnum } from './enums.js';
import { generatedImages } from './generated-images.js';
import { generationRequests } from './generation-requests.js';
import { users } from './users.js';

/**
 * 模型表（统一管理 AI 生成和用户上传）
 * 核心业务实体，包含完整的模型信息和统计数据
 */
export const models = mysqlTable(
	'models',
	{
		id: varchar('id', { length: 36 })
			.primaryKey()
			.$defaultFn(() => createId()),

		userId: varchar('user_id', { length: 36 }).notNull(),

		// 来源标识
		source: modelSourceEnum.notNull().default('AI_GENERATED'),

		// AI 生成时的关联（1:1约束）
		requestId: varchar('request_id', { length: 36 }),
		sourceImageId: varchar('source_image_id', { length: 36 }),

		// 基本信息
		name: varchar('name', { length: 255 }).notNull(),
		description: text('description'),
		modelUrl: varchar('model_url', { length: 500 }),
		previewImageUrl: varchar('preview_image_url', { length: 500 }),
		format: varchar('format', { length: 20 }).notNull().default('OBJ'),
		fileSize: int('file_size'),

		// 可见性
		visibility: modelVisibilityEnum.notNull().default('PRIVATE'),
		publishedAt: timestamp('published_at'),

		// 统计数据
		viewCount: int('view_count').notNull().default(0),
		likeCount: int('like_count').notNull().default(0),
		favoriteCount: int('favorite_count').notNull().default(0),
		downloadCount: int('download_count').notNull().default(0),

		// 打印相关
		sliceTaskId: varchar('slice_task_id', { length: 100 }),

		// 时间戳
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at')
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		completedAt: timestamp('completed_at'),
		failedAt: timestamp('failed_at'),

		// 错误信息
		errorMessage: text('error_message'),
	},
	(table) => [
		index('user_id_created_at_idx').on(table.userId, table.createdAt),
		index('source_idx').on(table.source),
		index('visibility_published_at_idx').on(table.visibility, table.publishedAt),
		index('visibility_like_count_idx').on(table.visibility, table.likeCount),
		index('request_id_idx').on(table.requestId),
		index('source_image_id_idx').on(table.sourceImageId),
	],
);

// 定义关系
export const modelsRelations = relations(models, ({ one, many }) => ({
	user: one(users, {
		fields: [models.userId],
		references: [users.id],
	}),
	request: one(generationRequests, {
		fields: [models.requestId],
		references: [generationRequests.id],
	}),
	sourceImage: one(generatedImages, {
		fields: [models.sourceImageId],
		references: [generatedImages.id],
	}),
	generationJob: one(modelGenerationJobs),
	interactions: many(modelInteractions),
}));

export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;

// 导入循环依赖
import { modelGenerationJobs } from './model-generation-jobs.js';
import { modelInteractions } from './model-interactions.js';
