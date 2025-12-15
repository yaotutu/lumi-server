import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { type GeneratedImage, generatedImages, type NewGeneratedImage } from '@/db/schema';

/**
 * GeneratedImage Repository
 * 生成图片数据访问层
 */
export class GeneratedImageRepository {
	/**
	 * 创建图片记录
	 */
	async create(data: NewGeneratedImage): Promise<GeneratedImage> {
		await db.insert(generatedImages).values(data);
		const image = await this.findById(data.id as string);
		if (!image) {
			throw new Error('Failed to create generated image');
		}
		return image;
	}

	/**
	 * 批量创建图片记录
	 */
	async createMany(data: NewGeneratedImage[]): Promise<GeneratedImage[]> {
		await db.insert(generatedImages).values(data);
		// 批量查询创建的记录
		const ids = data.map((d) => d.id as string);
		return this.findByIds(ids);
	}

	/**
	 * 根据 ID 查询图片
	 */
	async findById(id: string): Promise<GeneratedImage | undefined> {
		const [image] = await db
			.select()
			.from(generatedImages)
			.where(eq(generatedImages.id, id))
			.limit(1);
		return image;
	}

	/**
	 * 根据请求 ID 查询所有图片
	 */
	async findByRequestId(requestId: string): Promise<GeneratedImage[]> {
		return db
			.select()
			.from(generatedImages)
			.where(eq(generatedImages.requestId, requestId))
			.orderBy(generatedImages.index);
	}

	/**
	 * 根据请求 ID 和索引查询图片
	 */
	async findByRequestIdAndIndex(
		requestId: string,
		index: number,
	): Promise<GeneratedImage | undefined> {
		const [image] = await db
			.select()
			.from(generatedImages)
			.where(and(eq(generatedImages.requestId, requestId), eq(generatedImages.index, index)))
			.limit(1);
		return image;
	}

	/**
	 * 更新图片状态
	 */
	async updateStatus(
		id: string,
		status: string,
		additionalData: Partial<GeneratedImage> = {},
	): Promise<GeneratedImage | undefined> {
		await db
			.update(generatedImages)
			.set({
				imageStatus: status as GeneratedImage['imageStatus'],
				...additionalData,
			})
			.where(eq(generatedImages.id, id));

		return this.findById(id);
	}

	/**
	 * 更新图片信息
	 */
	async update(
		id: string,
		data: Partial<Omit<GeneratedImage, 'id' | 'requestId' | 'index' | 'createdAt'>>,
	): Promise<GeneratedImage | undefined> {
		await db.update(generatedImages).set(data).where(eq(generatedImages.id, id));

		return this.findById(id);
	}

	/**
	 * 删除图片
	 */
	async delete(id: string): Promise<boolean> {
		const result = await db.delete(generatedImages).where(eq(generatedImages.id, id));
		return (result[0].affectedRows ?? 0) > 0;
	}

	/**
	 * 根据请求 ID 删除所有图片
	 */
	async deleteByRequestId(requestId: string): Promise<number> {
		const result = await db.delete(generatedImages).where(eq(generatedImages.requestId, requestId));
		return result[0].affectedRows ?? 0;
	}

	/**
	 * 批量查询图片
	 */
	async findByIds(ids: string[]): Promise<GeneratedImage[]> {
		if (ids.length === 0) return [];
		return db.select().from(generatedImages).where(inArray(generatedImages.id, ids));
	}

	/**
	 * 根据状态查询图片
	 */
	async findByStatus(status: string, limit = 100): Promise<GeneratedImage[]> {
		return db
			.select()
			.from(generatedImages)
			.where(eq(generatedImages.imageStatus, status as GeneratedImage['imageStatus']))
			.limit(limit);
	}
}

// 导出单例
export const generatedImageRepository = new GeneratedImageRepository();
