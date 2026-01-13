import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { type ModelInteraction, modelInteractions, type NewModelInteraction } from '@/db/schema';

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
		const interaction = await this.findByUserModelAndType(
			data.externalUserId,
			data.modelId,
			data.type,
		);
		if (!interaction) {
			throw new Error('Failed to create interaction');
		}
		return interaction;
	}

	/**
	 * 查询交互记录
	 */
	async findByUserModelAndType(
		externalUserId: string,
		modelId: string,
		type: 'LIKE' | 'FAVORITE',
	): Promise<ModelInteraction | undefined> {
		const [interaction] = await db
			.select()
			.from(modelInteractions)
			.where(
				and(
					eq(modelInteractions.externalUserId, externalUserId),
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
	async delete(
		externalUserId: string,
		modelId: string,
		type: 'LIKE' | 'FAVORITE',
	): Promise<boolean> {
		const result = await db
			.delete(modelInteractions)
			.where(
				and(
					eq(modelInteractions.externalUserId, externalUserId),
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
		externalUserId: string,
		options: { limit?: number; offset?: number } = {},
	): Promise<ModelInteraction[]> {
		const { limit = 20, offset = 0 } = options;

		return db
			.select()
			.from(modelInteractions)
			.where(
				and(
					eq(modelInteractions.externalUserId, externalUserId),
					eq(modelInteractions.type, 'LIKE'),
				),
			)
			.orderBy(modelInteractions.createdAt)
			.limit(limit)
			.offset(offset);
	}

	/**
	 * 查询用户的所有收藏
	 */
	async findUserFavorites(
		externalUserId: string,
		options: { limit?: number; offset?: number } = {},
	): Promise<ModelInteraction[]> {
		const { limit = 20, offset = 0 } = options;

		return db
			.select()
			.from(modelInteractions)
			.where(
				and(
					eq(modelInteractions.externalUserId, externalUserId),
					eq(modelInteractions.type, 'FAVORITE'),
				),
			)
			.orderBy(modelInteractions.createdAt)
			.limit(limit)
			.offset(offset);
	}

	/**
	 * 批量查询用户对多个模型的交互状态
	 */
	async findBatchInteractions(
		externalUserId: string,
		modelIds: string[],
	): Promise<ModelInteraction[]> {
		if (modelIds.length === 0) return [];

		return db
			.select()
			.from(modelInteractions)
			.where(
				and(
					eq(modelInteractions.externalUserId, externalUserId),
					inArray(modelInteractions.modelId, modelIds),
				),
			);
	}

	/**
	 * 检查用户是否点赞了模型
	 */
	async hasLiked(externalUserId: string, modelId: string): Promise<boolean> {
		const interaction = await this.findByUserModelAndType(externalUserId, modelId, 'LIKE');
		return !!interaction;
	}

	/**
	 * 检查用户是否收藏了模型
	 */
	async hasFavorited(externalUserId: string, modelId: string): Promise<boolean> {
		const interaction = await this.findByUserModelAndType(externalUserId, modelId, 'FAVORITE');
		return !!interaction;
	}

	/**
	 * 统计用户点赞的模型数量
	 * @param externalUserId 用户外部 ID
	 * @returns 用户点赞的模型总数
	 */
	async countUserLikes(externalUserId: string): Promise<number> {
		// 使用 SQL COUNT 聚合函数统计点赞记录数
		const [result] = await db
			.select({ count: sql<number>`count(*)` })
			.from(modelInteractions)
			.where(
				and(
					eq(modelInteractions.externalUserId, externalUserId),
					eq(modelInteractions.type, 'LIKE'),
				),
			);

		return result.count;
	}

	/**
	 * 统计用户收藏的模型数量
	 * @param externalUserId 用户外部 ID
	 * @returns 用户收藏的模型总数
	 */
	async countUserFavorites(externalUserId: string): Promise<number> {
		// 使用 SQL COUNT 聚合函数统计收藏记录数
		const [result] = await db
			.select({ count: sql<number>`count(*)` })
			.from(modelInteractions)
			.where(
				and(
					eq(modelInteractions.externalUserId, externalUserId),
					eq(modelInteractions.type, 'FAVORITE'),
				),
			);

		return result.count;
	}
}

// 导出单例
export const interactionRepository = new InteractionRepository();
