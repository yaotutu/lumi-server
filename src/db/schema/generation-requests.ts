import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { index, int, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { requestPhaseEnum, requestStatusEnum } from './enums';

/**
 * 生成请求表（主任务）
 * 管理整个图片生成 → 模型生成的生命周期
 */
export const generationRequests = mysqlTable(
	'generation_requests',
	{
		id: varchar('id', { length: 36 })
			.primaryKey()
			.$defaultFn(() => createId()),

		externalUserId: varchar('external_user_id', { length: 36 }).notNull(),
		prompt: text('prompt').notNull(), // ✅ 优化后的提示词（用于实际生成图片）
		originalPrompt: text('original_prompt'), // ✅ 用户原始输入的提示词

		// 状态管理
		status: requestStatusEnum.notNull().default('IMAGE_PENDING'),
		phase: requestPhaseEnum.notNull().default('IMAGE_GENERATION'),
		selectedImageIndex: int('selected_image_index'),

		// 时间戳
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at')
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		completedAt: timestamp('completed_at'),
	},
	(table) => [
		index('external_user_id_created_at_idx').on(table.externalUserId, table.createdAt),
		index('status_phase_idx').on(table.status, table.phase),
	],
);

// 定义关系
export const generationRequestsRelations = relations(generationRequests, ({ one, many }) => ({
	images: many(generatedImages),
	model: one(models),
}));

export type GenerationRequest = typeof generationRequests.$inferSelect;
export type NewGenerationRequest = typeof generationRequests.$inferInsert;

// 导入循环依赖
import { generatedImages } from './generated-images';
import { models } from './models';
