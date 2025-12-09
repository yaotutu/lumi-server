import { db } from '@/db/drizzle';
import { type GenerationRequest, type NewGenerationRequest, generationRequests } from '@/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

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
	 * 根据 ID 查询请求
	 */
	async findById(id: string): Promise<GenerationRequest | undefined> {
		const [request] = await db
			.select()
			.from(generationRequests)
			.where(eq(generationRequests.id, id))
			.limit(1);
		return request;
	}

	/**
	 * 根据用户 ID 查询请求列表（分页）
	 */
	async findByUserId(
		userId: string,
		options: {
			limit?: number;
			offset?: number;
		} = {},
	): Promise<GenerationRequest[]> {
		const { limit = 20, offset = 0 } = options;

		return db
			.select()
			.from(generationRequests)
			.where(eq(generationRequests.userId, userId))
			.orderBy(desc(generationRequests.createdAt))
			.limit(limit)
			.offset(offset);
	}

	/**
	 * 统计用户的请求总数
	 */
	async countByUserId(userId: string): Promise<number> {
		const [result] = await db
			.select({ count: sql<number>`count(*)` })
			.from(generationRequests)
			.where(eq(generationRequests.userId, userId));

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
	 * 根据用户 ID 和请求 ID 查询（用于权限验证）
	 */
	async findByIdAndUserId(id: string, userId: string): Promise<GenerationRequest | undefined> {
		const [request] = await db
			.select()
			.from(generationRequests)
			.where(and(eq(generationRequests.id, id), eq(generationRequests.userId, userId)))
			.limit(1);

		return request;
	}
}

// 导出单例
export const generationRequestRepository = new GenerationRequestRepository();
