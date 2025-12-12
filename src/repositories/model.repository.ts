import { db } from '@/db/drizzle';
import { type Model, type NewModel, models, users } from '@/db/schema';
import { transformToProxyUrl } from '@/utils/url-transformer';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

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
	 * 返回包含用户信息的模型列表（JOIN users 表）
	 * URL 已转换为代理 URL，前端可直接使用
	 */
	async findPublicModels(
		options: {
			sortBy?: 'latest' | 'popular' | 'liked';
			limit?: number;
			offset?: number;
		} = {},
	): Promise<any[]> {
		const { sortBy = 'latest', limit = 20, offset = 0 } = options;

		// 构建查询，JOIN users 表获取用户信息
		const baseQuery = db
			.select({
				id: models.id,
				name: models.name,
				description: models.description,
				previewImageUrl: models.previewImageUrl,
				modelUrl: models.modelUrl,
				mtlUrl: models.mtlUrl, // ✅ OBJ 格式专用：MTL 材质文件 URL
				textureUrl: models.textureUrl, // ✅ OBJ 格式专用：纹理图片 URL
				format: models.format,
				visibility: models.visibility,
				likeCount: models.likeCount,
				favoriteCount: models.favoriteCount,
				viewCount: models.viewCount,
				downloadCount: models.downloadCount,
				userId: models.userId,
				requestId: models.requestId,
				sourceImageId: models.sourceImageId,
				publishedAt: models.publishedAt,
				completedAt: models.completedAt,
				createdAt: models.createdAt,
				updatedAt: models.updatedAt,
				// 关联 user 信息
				user: {
					id: users.id,
					name: users.name,
				},
			})
			.from(models)
			.leftJoin(users, eq(models.userId, users.id))
			.where(
				and(
					eq(models.visibility, 'PUBLIC'),
					isNotNull(models.completedAt), // 只返回已完成的模型
				),
			);

		// 根据排序方式获取结果
		let results;
		if (sortBy === 'popular') {
			results = await baseQuery.orderBy(desc(models.viewCount)).limit(limit).offset(offset);
		} else if (sortBy === 'liked') {
			results = await baseQuery.orderBy(desc(models.likeCount)).limit(limit).offset(offset);
		} else {
			results = await baseQuery.orderBy(desc(models.publishedAt)).limit(limit).offset(offset);
		}

		// 转换 URL 为代理 URL（解决跨域问题，前端可直接使用）
		return results.map((model) => ({
			...model,
			previewImageUrl: transformToProxyUrl(model.previewImageUrl, 'image'),
			modelUrl: transformToProxyUrl(model.modelUrl, 'model'),
			mtlUrl: transformToProxyUrl(model.mtlUrl, 'model'), // ✅ 转换 MTL 文件 URL
			textureUrl: transformToProxyUrl(model.textureUrl, 'model'), // ✅ 转换纹理图片 URL
		}));
	}

	/**
	 * 统计公开模型总数（只统计已完成的模型）
	 */
	async countPublicModels(): Promise<number> {
		const [result] = await db
			.select({ count: sql<number>`count(*)` })
			.from(models)
			.where(
				and(
					eq(models.visibility, 'PUBLIC'),
					isNotNull(models.completedAt), // 只统计已完成的模型
				),
			);

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
