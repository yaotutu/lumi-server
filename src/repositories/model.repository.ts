import { db } from '@/db/drizzle';
import { type Model, type NewModel, models } from '@/db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

/**
 * Model Repository
 * 模型数据访问层
 */
export class ModelRepository {
	/**
	 * 创建模型
	 */
	async create(data: NewModel): Promise<Model> {
		await db.insert(models).values(data);
		const model = await this.findById(data.id as string);
		if (!model) {
			throw new Error('Failed to create model');
		}
		return model;
	}

	/**
	 * 根据 ID 查询模型
	 */
	async findById(id: string): Promise<Model | undefined> {
		const [model] = await db.select().from(models).where(eq(models.id, id)).limit(1);
		return model;
	}

	/**
	 * 根据用户 ID 查询模型列表
	 */
	async findByUserId(
		userId: string,
		options: {
			limit?: number;
			offset?: number;
		} = {},
	): Promise<Model[]> {
		const { limit = 20, offset = 0 } = options;

		return db
			.select()
			.from(models)
			.where(eq(models.userId, userId))
			.orderBy(desc(models.createdAt))
			.limit(limit)
			.offset(offset);
	}

	/**
	 * 查询公开模型列表（支持筛选和排序）
	 */
	async findPublicModels(
		options: {
			sortBy?: 'latest' | 'popular' | 'liked';
			limit?: number;
			offset?: number;
		} = {},
	): Promise<Model[]> {
		const { sortBy = 'latest', limit = 20, offset = 0 } = options;

		const baseQuery = db.select().from(models).where(eq(models.visibility, 'PUBLIC'));

		// 根据排序方式返回不同的查询
		if (sortBy === 'popular') {
			return baseQuery.orderBy(desc(models.viewCount)).limit(limit).offset(offset);
		}

		if (sortBy === 'liked') {
			return baseQuery.orderBy(desc(models.likeCount)).limit(limit).offset(offset);
		}

		return baseQuery.orderBy(desc(models.publishedAt)).limit(limit).offset(offset);
	}

	/**
	 * 统计公开模型总数
	 */
	async countPublicModels(): Promise<number> {
		const [result] = await db
			.select({ count: sql<number>`count(*)` })
			.from(models)
			.where(eq(models.visibility, 'PUBLIC'));

		return result.count;
	}

	/**
	 * 根据请求 ID 查询模型
	 */
	async findByRequestId(requestId: string): Promise<Model | undefined> {
		const [model] = await db.select().from(models).where(eq(models.requestId, requestId)).limit(1);
		return model;
	}

	/**
	 * 根据源图片 ID 查询模型
	 */
	async findBySourceImageId(sourceImageId: string): Promise<Model | undefined> {
		const [model] = await db
			.select()
			.from(models)
			.where(eq(models.sourceImageId, sourceImageId))
			.limit(1);
		return model;
	}

	/**
	 * 更新模型
	 */
	async update(
		id: string,
		data: Partial<Omit<Model, 'id' | 'createdAt'>>,
	): Promise<Model | undefined> {
		await db
			.update(models)
			.set({
				...data,
				updatedAt: new Date(),
			})
			.where(eq(models.id, id));

		return this.findById(id);
	}

	/**
	 * 更新模型可见性
	 */
	async updateVisibility(id: string, visibility: 'PRIVATE' | 'PUBLIC'): Promise<Model | undefined> {
		await db
			.update(models)
			.set({
				visibility,
				publishedAt: visibility === 'PUBLIC' ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(eq(models.id, id));

		return this.findById(id);
	}

	/**
	 * 增加浏览计数
	 */
	async incrementViewCount(id: string): Promise<void> {
		await db
			.update(models)
			.set({
				viewCount: sql`${models.viewCount} + 1`,
			})
			.where(eq(models.id, id));
	}

	/**
	 * 增加点赞计数
	 */
	async incrementLikeCount(id: string): Promise<void> {
		await db
			.update(models)
			.set({
				likeCount: sql`${models.likeCount} + 1`,
			})
			.where(eq(models.id, id));
	}

	/**
	 * 减少点赞计数
	 */
	async decrementLikeCount(id: string): Promise<void> {
		await db
			.update(models)
			.set({
				likeCount: sql`GREATEST(0, ${models.likeCount} - 1)`,
			})
			.where(eq(models.id, id));
	}

	/**
	 * 增加收藏计数
	 */
	async incrementFavoriteCount(id: string): Promise<void> {
		await db
			.update(models)
			.set({
				favoriteCount: sql`${models.favoriteCount} + 1`,
			})
			.where(eq(models.id, id));
	}

	/**
	 * 减少收藏计数
	 */
	async decrementFavoriteCount(id: string): Promise<void> {
		await db
			.update(models)
			.set({
				favoriteCount: sql`GREATEST(0, ${models.favoriteCount} - 1)`,
			})
			.where(eq(models.id, id));
	}

	/**
	 * 增加下载计数
	 */
	async incrementDownloadCount(id: string): Promise<void> {
		await db
			.update(models)
			.set({
				downloadCount: sql`${models.downloadCount} + 1`,
			})
			.where(eq(models.id, id));
	}

	/**
	 * 删除模型
	 */
	async delete(id: string): Promise<boolean> {
		const result = await db.delete(models).where(eq(models.id, id));
		return (result[0].affectedRows ?? 0) > 0;
	}

	/**
	 * 批量查询模型
	 */
	async findByIds(ids: string[]): Promise<Model[]> {
		if (ids.length === 0) return [];
		return db.select().from(models).where(inArray(models.id, ids));
	}

	/**
	 * 根据用户 ID 和模型 ID 查询（用于权限验证）
	 */
	async findByIdAndUserId(id: string, userId: string): Promise<Model | undefined> {
		const [model] = await db
			.select()
			.from(models)
			.where(and(eq(models.id, id), eq(models.userId, userId)))
			.limit(1);

		return model;
	}
}

// 导出单例
export const modelRepository = new ModelRepository();
