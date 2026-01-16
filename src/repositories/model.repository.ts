import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import {
	generatedImages,
	generationRequests,
	type Model,
	modelGenerationJobs,
	models,
	type NewModel,
} from '@/db/schema';
import { transformToProxyUrl } from '@/utils/url-transformer';

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
	 * 使用事务创建模型（用于保证多个操作的原子性）
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle 事务类型过于复杂，使用 any 简化
	async createWithTransaction(tx: any, data: NewModel): Promise<void> {
		await tx.insert(models).values(data);
	}

	/**
	 * 根据 ID 查询模型
	 * 返回包含请求信息、源图片信息和生成任务信息的模型数据
	 * URL 已转换为代理 URL，前端可直接使用
	 */
	// biome-ignore lint/suspicious/noExplicitAny: 复杂的 join 查询返回类型，待定义专门的返回类型接口
	async findById(id: string): Promise<any> {
		const [result] = await db
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
				externalUserId: models.externalUserId,
				requestId: models.requestId,
				sourceImageId: models.sourceImageId,
				publishedAt: models.publishedAt,
				completedAt: models.completedAt,
				createdAt: models.createdAt,
				updatedAt: models.updatedAt,
				failedAt: models.failedAt,
				errorMessage: models.errorMessage,
				source: models.source,
				fileSize: models.fileSize,
				sliceTaskId: models.sliceTaskId,
				printStatus: models.printStatus,
				// 关联 request 信息
				request: {
					id: generationRequests.id,
					prompt: generationRequests.originalPrompt,
					status: generationRequests.status,
					phase: generationRequests.phase,
				},
				// 关联 sourceImage 信息
				sourceImage: {
					id: generatedImages.id,
					imageUrl: generatedImages.imageUrl,
					index: generatedImages.index,
					imagePrompt: generatedImages.imagePrompt,
				},
				// 关联 generationJob 信息
				generationJob: {
					id: modelGenerationJobs.id,
					status: modelGenerationJobs.status,
					progress: modelGenerationJobs.progress,
					retryCount: modelGenerationJobs.retryCount,
					providerJobId: modelGenerationJobs.providerJobId,
				},
			})
			.from(models)
			.leftJoin(generationRequests, eq(models.requestId, generationRequests.id))
			.leftJoin(generatedImages, eq(models.sourceImageId, generatedImages.id))
			.leftJoin(modelGenerationJobs, eq(models.id, modelGenerationJobs.modelId))
			.where(eq(models.id, id))
			.limit(1);

		if (!result) return undefined;

		// 转换 URL 为代理 URL（解决跨域问题，前端可直接使用）
		return {
			...result,
			previewImageUrl: transformToProxyUrl(result.previewImageUrl, 'image'),
			modelUrl: transformToProxyUrl(result.modelUrl, 'model'),
			mtlUrl: transformToProxyUrl(result.mtlUrl, 'model'), // ✅ 转换 MTL 文件 URL
			textureUrl: transformToProxyUrl(result.textureUrl, 'model'), // ✅ 转换纹理图片 URL
			// 转换 sourceImage 中的 imageUrl
			sourceImage: result.sourceImage
				? {
						...result.sourceImage,
						imageUrl: transformToProxyUrl(result.sourceImage.imageUrl, 'image'),
					}
				: null,
		};
	}

	/**
	 * 根据切片任务 ID 查询模型
	 * 用于查询切片任务状态
	 */
	// biome-ignore lint/suspicious/noExplicitAny: 复杂的 join 查询返回类型，待定义专门的返回类型接口
	async findBySliceTaskId(sliceTaskId: string): Promise<any> {
		const [result] = await db
			.select({
				id: models.id,
				sliceTaskId: models.sliceTaskId,
				sliceStatus: models.sliceStatus,
				gcodeUrl: models.gcodeUrl,
				gcodeMetadata: models.gcodeMetadata,
				externalUserId: models.externalUserId,
				updatedAt: models.updatedAt,
			})
			.from(models)
			.where(eq(models.sliceTaskId, sliceTaskId))
			.limit(1);

		return result;
	}

	/**
	 * 根据用户外部 ID 查询模型列表（支持筛选和排序）
	 */
	async findByUserId(
		externalUserId: string,
		options: {
			visibility?: 'PUBLIC' | 'PRIVATE';
			sortBy?: 'latest' | 'name' | 'popular';
			limit?: number;
			offset?: number;
		} = {},
	): Promise<Model[]> {
		const { visibility, sortBy = 'latest', limit = 20, offset = 0 } = options;

		// 构建基础查询条件
		const conditions = visibility
			? and(eq(models.externalUserId, externalUserId), eq(models.visibility, visibility))
			: eq(models.externalUserId, externalUserId);

		// 根据排序方式选择排序字段
		let orderBy: ReturnType<typeof desc> | typeof models.name;
		if (sortBy === 'latest') {
			orderBy = desc(models.createdAt);
		} else if (sortBy === 'name') {
			orderBy = models.name;
		} else if (sortBy === 'popular') {
			orderBy = desc(models.viewCount);
		} else {
			orderBy = desc(models.createdAt);
		}

		// 执行查询
		return db.select().from(models).where(conditions).orderBy(orderBy).limit(limit).offset(offset);
	}

	/**
	 * 统计用户模型数量（支持按可见性筛选）
	 */
	async countByUserId(
		externalUserId: string,
		options: { visibility?: 'PUBLIC' | 'PRIVATE' } = {},
	): Promise<number> {
		const { visibility } = options;

		const conditions = visibility
			? and(eq(models.externalUserId, externalUserId), eq(models.visibility, visibility))
			: eq(models.externalUserId, externalUserId);

		const query = db.select({ count: sql<number>`count(*)` }).from(models).where(conditions);

		const [result] = await query;
		return result.count;
	}

	/**
	 * 获取用户模型的聚合统计数据
	 * 统计用户所有公开模型的点赞、收藏、浏览、下载的总和
	 * @param externalUserId 用户外部 ID
	 * @returns 聚合统计数据对象（已转换为数字类型）
	 */
	async getUserModelsAggregateStats(externalUserId: string): Promise<{
		totalLikes: number;
		totalFavorites: number;
		totalViews: number;
		totalDownloads: number;
	}> {
		// 使用 SQL 聚合函数统计用户所有公开模型的总数据
		// 只统计公开模型，私有模型不计入统计
		const [result] = await db
			.select({
				totalLikes: sql<number>`COALESCE(SUM(${models.likeCount}), 0)`,
				totalFavorites: sql<number>`COALESCE(SUM(${models.favoriteCount}), 0)`,
				totalViews: sql<number>`COALESCE(SUM(${models.viewCount}), 0)`,
				totalDownloads: sql<number>`COALESCE(SUM(${models.downloadCount}), 0)`,
			})
			.from(models)
			.where(and(eq(models.externalUserId, externalUserId), eq(models.visibility, 'PUBLIC')));

		// COALESCE 确保即使没有记录，也返回 0 而不是 null
		// 需要显式转换为数字类型，因为 SQL SUM 可能返回字符串
		return {
			totalLikes: Number(result.totalLikes) || 0,
			totalFavorites: Number(result.totalFavorites) || 0,
			totalViews: Number(result.totalViews) || 0,
			totalDownloads: Number(result.totalDownloads) || 0,
		};
	}

	/**
	 * 查询公开模型列表（支持筛选和排序）
	 * URL 已转换为代理 URL，前端可直接使用
	 */
	async findPublicModels(
		options: { sortBy?: 'latest' | 'popular' | 'liked'; limit?: number; offset?: number } = {},
		// biome-ignore lint/suspicious/noExplicitAny: 复杂的 join 查询返回类型，待定义专门的返回类型接口
	): Promise<any[]> {
		const { sortBy = 'latest', limit = 20, offset = 0 } = options;

		// 构建查询
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
				externalUserId: models.externalUserId,
				requestId: models.requestId,
				sourceImageId: models.sourceImageId,
				publishedAt: models.publishedAt,
				completedAt: models.completedAt,
				createdAt: models.createdAt,
				updatedAt: models.updatedAt,
			})
			.from(models)
			.where(
				and(
					eq(models.visibility, 'PUBLIC'),
					isNotNull(models.completedAt), // 只返回已完成的模型
				),
			);

		// 根据排序方式获取结果
		// biome-ignore lint/suspicious/noImplicitAnyLet: baseQuery 的返回类型由 Drizzle 推断，显式类型定义过于复杂
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
	 * 根据用户外部 ID 和模型 ID 查询（用于权限验证）
	 */
	async findByIdAndUserId(id: string, externalUserId: string): Promise<Model | undefined> {
		const [model] = await db
			.select()
			.from(models)
			.where(and(eq(models.id, id), eq(models.externalUserId, externalUserId)))
			.limit(1);

		return model;
	}
}

// 导出单例
export const modelRepository = new ModelRepository();
