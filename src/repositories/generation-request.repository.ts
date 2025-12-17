import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import {
	type GenerationRequest,
	generatedImages,
	generationRequests,
	imageGenerationJobs,
	modelGenerationJobs,
	models,
	type NewGenerationRequest,
} from '@/db/schema';
import { transformToProxyUrl } from '@/utils/url-transformer';

/**
 * GenerationRequest Repository
 * 生成请求数据访问层
 */
export class GenerationRequestRepository {
	/**
	 * 创建生成请求
	 */
	async create(data: NewGenerationRequest): Promise<GenerationRequest> {
		await db.insert(generationRequests).values(data);
		// MySQL 不支持 returning，需要重新查询
		const request = await this.findById(data.id as string);
		if (!request) {
			throw new Error('Failed to create generation request');
		}
		return request;
	}

	/**
	 * 根据 ID 查询请求（包含关联的 images 和 model）
	 * 手动加载关联数据，确保与 Prisma 格式一致
	 * URL 已转换为代理 URL，前端可直接使用
	 */
	async findById(id: string) {
		// 1. 查询主请求
		const [request] = await db
			.select()
			.from(generationRequests)
			.where(eq(generationRequests.id, id))
			.limit(1);

		if (!request) {
			return undefined;
		}

		// 2. 查询关联的 images（带 generationJob）
		const images = await db
			.select({
				id: generatedImages.id,
				requestId: generatedImages.requestId,
				index: generatedImages.index,
				imageUrl: generatedImages.imageUrl,
				imagePrompt: generatedImages.imagePrompt,
				imageStatus: generatedImages.imageStatus,
				createdAt: generatedImages.createdAt,
				completedAt: generatedImages.completedAt,
				failedAt: generatedImages.failedAt,
				errorMessage: generatedImages.errorMessage,
				// 嵌套的 generationJob
				generationJob: {
					id: imageGenerationJobs.id,
					status: imageGenerationJobs.status,
					retryCount: imageGenerationJobs.retryCount,
				},
			})
			.from(generatedImages)
			.leftJoin(imageGenerationJobs, eq(generatedImages.id, imageGenerationJobs.imageId))
			.where(eq(generatedImages.requestId, id))
			.orderBy(asc(generatedImages.index));

		// 3. 查询关联的 model（带 generationJob）
		const [modelRow] = await db
			.select({
				id: models.id,
				externalUserId: models.externalUserId,
				source: models.source,
				requestId: models.requestId,
				sourceImageId: models.sourceImageId,
				name: models.name,
				description: models.description,
				modelUrl: models.modelUrl,
				mtlUrl: models.mtlUrl, // ✅ OBJ 格式专用：MTL 材质文件 URL
				textureUrl: models.textureUrl, // ✅ OBJ 格式专用：纹理图片 URL
				previewImageUrl: models.previewImageUrl,
				format: models.format,
				fileSize: models.fileSize,
				visibility: models.visibility,
				publishedAt: models.publishedAt,
				viewCount: models.viewCount,
				likeCount: models.likeCount,
				favoriteCount: models.favoriteCount,
				downloadCount: models.downloadCount,
				sliceTaskId: models.sliceTaskId,
				printStatus: models.printStatus,
				createdAt: models.createdAt,
				updatedAt: models.updatedAt,
				completedAt: models.completedAt,
				failedAt: models.failedAt,
				errorMessage: models.errorMessage,
				// 嵌套的 generationJob
				generationJob: {
					id: modelGenerationJobs.id,
					status: modelGenerationJobs.status,
					progress: modelGenerationJobs.progress,
				},
			})
			.from(models)
			.leftJoin(modelGenerationJobs, eq(models.id, modelGenerationJobs.modelId))
			.where(eq(models.requestId, id))
			.limit(1);

		// 4. 转换 URL 为代理 URL（解决跨域问题，前端可直接使用）
		const transformedImages = images.map((img) => ({
			...img,
			imageUrl: transformToProxyUrl(img.imageUrl, 'image'),
		}));

		const transformedModel = modelRow
			? {
					...modelRow,
					modelUrl: transformToProxyUrl(modelRow.modelUrl, 'model'),
					mtlUrl: transformToProxyUrl(modelRow.mtlUrl, 'model'), // ✅ 转换 MTL 文件 URL
					textureUrl: transformToProxyUrl(modelRow.textureUrl, 'model'), // ✅ 转换纹理图片 URL
					previewImageUrl: transformToProxyUrl(modelRow.previewImageUrl, 'image'),
				}
			: null;

		// 5. 组装返回数据（与 Prisma 格式一致）
		const result = {
			...request,
			images: transformedImages,
			model: transformedModel,
		};

		return result;
	}

	/**
	 * 根据用户外部 ID 查询请求列表（分页，包含关联数据）
	 * 手动加载关联数据，确保与 Prisma 格式一致
	 * URL 已转换为代理 URL，前端可直接使用
	 */
	async findByUserId(
		externalUserId: string,
		options: {
			limit?: number;
			offset?: number;
		} = {},
	) {
		const { limit = 20, offset = 0 } = options;

		// 1. 查询主请求列表
		const requests = await db
			.select()
			.from(generationRequests)
			.where(eq(generationRequests.externalUserId, externalUserId))
			.orderBy(desc(generationRequests.createdAt))
			.limit(limit)
			.offset(offset);

		if (requests.length === 0) {
			return [];
		}

		const requestIds = requests.map((r) => r.id);

		// 2. 批量查询所有请求的 images
		const allImages = await db
			.select({
				id: generatedImages.id,
				requestId: generatedImages.requestId,
				index: generatedImages.index,
				imageUrl: generatedImages.imageUrl,
				imagePrompt: generatedImages.imagePrompt,
				imageStatus: generatedImages.imageStatus,
				createdAt: generatedImages.createdAt,
				completedAt: generatedImages.completedAt,
				failedAt: generatedImages.failedAt,
				errorMessage: generatedImages.errorMessage,
				// 嵌套的 generationJob
				generationJob: {
					id: imageGenerationJobs.id,
					status: imageGenerationJobs.status,
				},
			})
			.from(generatedImages)
			.leftJoin(imageGenerationJobs, eq(generatedImages.id, imageGenerationJobs.imageId))
			.where(
				sql`${generatedImages.requestId} IN (${sql.join(
					requestIds.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			)
			.orderBy(asc(generatedImages.index));

		// 3. 批量查询所有请求的 models
		const allModels = await db
			.select({
				id: models.id,
				requestId: models.requestId,
				modelUrl: models.modelUrl,
				mtlUrl: models.mtlUrl, // ✅ OBJ 格式专用：MTL 材质文件 URL
				textureUrl: models.textureUrl, // ✅ OBJ 格式专用：纹理图片 URL
				previewImageUrl: models.previewImageUrl,
				format: models.format,
				completedAt: models.completedAt,
				// 嵌套的 generationJob
				generationJob: {
					id: modelGenerationJobs.id,
					status: modelGenerationJobs.status,
					progress: modelGenerationJobs.progress,
				},
			})
			.from(models)
			.leftJoin(modelGenerationJobs, eq(models.id, modelGenerationJobs.modelId))
			.where(
				sql`${models.requestId} IN (${sql.join(
					requestIds.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			);

		// 4. 按 requestId 分组并转换 URL
		const imagesMap = new Map<string, typeof allImages>();
		for (const img of allImages) {
			// 获取或创建数组
			let imagesList = imagesMap.get(img.requestId);
			if (!imagesList) {
				imagesList = [];
				imagesMap.set(img.requestId, imagesList);
			}
			// 转换图片 URL
			imagesList.push({
				...img,
				imageUrl: transformToProxyUrl(img.imageUrl, 'image'),
			});
		}

		const modelsMap = new Map<string, (typeof allModels)[0]>();
		for (const model of allModels) {
			if (model.requestId) {
				// 转换模型 URL
				modelsMap.set(model.requestId, {
					...model,
					modelUrl: transformToProxyUrl(model.modelUrl, 'model'),
					mtlUrl: transformToProxyUrl(model.mtlUrl, 'model'), // ✅ 转换 MTL 文件 URL
					textureUrl: transformToProxyUrl(model.textureUrl, 'model'), // ✅ 转换纹理图片 URL
					previewImageUrl: transformToProxyUrl(model.previewImageUrl, 'image'),
				});
			}
		}

		// 5. 组装返回数据（与 Prisma 格式一致）
		return requests.map((request) => {
			const images = imagesMap.get(request.id) || [];
			const model = modelsMap.get(request.id) || null;

			return {
				...request,
				images: images,
				model: model,
			};
		});
	}

	/**
	 * 统计用户的请求总数
	 */
	async countByUserId(externalUserId: string): Promise<number> {
		const [result] = await db
			.select({ count: sql<number>`count(*)` })
			.from(generationRequests)
			.where(eq(generationRequests.externalUserId, externalUserId));

		return result.count;
	}

	/**
	 * 更新请求状态
	 */
	async updateStatus(
		id: string,
		status: string,
		additionalData: Partial<GenerationRequest> = {},
	): Promise<GenerationRequest | undefined> {
		await db
			.update(generationRequests)
			.set({
				status: status as GenerationRequest['status'],
				...additionalData,
				updatedAt: new Date(),
			})
			.where(eq(generationRequests.id, id));

		return this.findById(id);
	}

	/**
	 * 更新请求（通用）
	 */
	async update(
		id: string,
		data: Partial<Omit<GenerationRequest, 'id' | 'createdAt'>>,
	): Promise<GenerationRequest | undefined> {
		await db
			.update(generationRequests)
			.set({
				...data,
				updatedAt: new Date(),
			})
			.where(eq(generationRequests.id, id));

		return this.findById(id);
	}

	/**
	 * 删除请求
	 */
	async delete(id: string): Promise<boolean> {
		const result = await db.delete(generationRequests).where(eq(generationRequests.id, id));

		return (result[0].affectedRows ?? 0) > 0;
	}

	/**
	 * 根据用户外部 ID 和请求 ID 查询（用于权限验证）
	 */
	async findByIdAndUserId(id: string, externalUserId: string): Promise<GenerationRequest | undefined> {
		const [request] = await db
			.select()
			.from(generationRequests)
			.where(and(eq(generationRequests.id, id), eq(generationRequests.externalUserId, externalUserId)))
			.limit(1);

		return request;
	}
}

// 导出单例
export const generationRequestRepository = new GenerationRequestRepository();
