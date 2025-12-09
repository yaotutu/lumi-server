import { db } from '@/db/drizzle';
import { type ModelInteraction, type NewModelInteraction, modelInteractions } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * ModelInteraction Repository
 * 模型交互（点赞/收藏）数据访问层
 */
export class InteractionRepository {
	/**
	 * 创建交互记录
	 */
	async create(data: NewModelInteraction): Promise<ModelInteraction> {
		await db.insert(modelInteractions).values(data);
		const interaction = await this.findByUserModelAndType(data.userId, data.modelId, data.type);
		if (!interaction) {
			throw new Error('Failed to create interaction');
		}
		return interaction;
	}

	/**
	 * 查询交互记录
	 */
	async findByUserModelAndType(
		userId: string,
		modelId: string,
		type: 'LIKE' | 'FAVORITE',
	): Promise<ModelInteraction | undefined> {
		const [interaction] = await db
			.select()
			.from(modelInteractions)
			.where(
				and(
					eq(modelInteractions.userId, userId),
					eq(modelInteractions.modelId, modelId),
					eq(modelInteractions.type, type),
				),
			)
			.limit(1);

		return interaction;
	}

	/**
	 * 删除交互记录
	 */
	async delete(userId: string, modelId: string, type: 'LIKE' | 'FAVORITE'): Promise<boolean> {
		const result = await db
			.delete(modelInteractions)
			.where(
				and(
					eq(modelInteractions.userId, userId),
					eq(modelInteractions.modelId, modelId),
					eq(modelInteractions.type, type),
				),
			);

		return (result[0].affectedRows ?? 0) > 0;
	}

	/**
	 * 查询用户的所有点赞
	 */
	async findUserLikes(
		userId: string,
		options: { limit?: number; offset?: number } = {},
	): Promise<ModelInteraction[]> {
		const { limit = 20, offset = 0 } = options;

		return db
			.select()
			.from(modelInteractions)
			.where(and(eq(modelInteractions.userId, userId), eq(modelInteractions.type, 'LIKE')))
			.orderBy(modelInteractions.createdAt)
			.limit(limit)
			.offset(offset);
	}

	/**
	 * 查询用户的所有收藏
	 */
	async findUserFavorites(
		userId: string,
		options: { limit?: number; offset?: number } = {},
	): Promise<ModelInteraction[]> {
		const { limit = 20, offset = 0 } = options;

		return db
			.select()
			.from(modelInteractions)
			.where(and(eq(modelInteractions.userId, userId), eq(modelInteractions.type, 'FAVORITE')))
			.orderBy(modelInteractions.createdAt)
			.limit(limit)
			.offset(offset);
	}

	/**
	 * 批量查询用户对多个模型的交互状态
	 */
	async findBatchInteractions(userId: string, modelIds: string[]): Promise<ModelInteraction[]> {
		if (modelIds.length === 0) return [];

		return db
			.select()
			.from(modelInteractions)
			.where(
				and(eq(modelInteractions.userId, userId), inArray(modelInteractions.modelId, modelIds)),
			);
	}

	/**
	 * 检查用户是否点赞了模型
	 */
	async hasLiked(userId: string, modelId: string): Promise<boolean> {
		const interaction = await this.findByUserModelAndType(userId, modelId, 'LIKE');
		return !!interaction;
	}

	/**
	 * 检查用户是否收藏了模型
	 */
	async hasFavorited(userId: string, modelId: string): Promise<boolean> {
		const interaction = await this.findByUserModelAndType(userId, modelId, 'FAVORITE');
		return !!interaction;
	}
}

// 导出单例
export const interactionRepository = new InteractionRepository();
