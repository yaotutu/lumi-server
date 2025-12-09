import { db } from '@/db/drizzle';
import {
	type ImageGenerationJob,
	type NewImageGenerationJob,
	imageGenerationJobs,
} from '@/db/schema';
import { and, eq, lt, or } from 'drizzle-orm';

/**
 * ImageGenerationJob Repository
 * 图片生成任务数据访问层
 */
export class ImageJobRepository {
	/**
	 * 创建任务
	 */
	async create(data: NewImageGenerationJob): Promise<ImageGenerationJob> {
		await db.insert(imageGenerationJobs).values(data);
		const job = await this.findById(data.id as string);
		if (!job) {
			throw new Error('Failed to create image generation job');
		}
		return job;
	}

	/**
	 * 批量创建任务
	 */
	async createMany(data: NewImageGenerationJob[]): Promise<ImageGenerationJob[]> {
		await db.insert(imageGenerationJobs).values(data);
		const ids = data.map((d) => d.id as string);
		return db
			.select()
			.from(imageGenerationJobs)
			.where(or(...ids.map((id) => eq(imageGenerationJobs.id, id))));
	}

	/**
	 * 根据 ID 查询任务
	 */
	async findById(id: string): Promise<ImageGenerationJob | undefined> {
		const [job] = await db
			.select()
			.from(imageGenerationJobs)
			.where(eq(imageGenerationJobs.id, id))
			.limit(1);
		return job;
	}

	/**
	 * 根据图片 ID 查询任务
	 */
	async findByImageId(imageId: string): Promise<ImageGenerationJob | undefined> {
		const [job] = await db
			.select()
			.from(imageGenerationJobs)
			.where(eq(imageGenerationJobs.imageId, imageId))
			.limit(1);
		return job;
	}

	/**
	 * 查询待处理的任务（PENDING + 已到达重试时间的 RETRYING）
	 */
	async findPendingJobs(limit = 100): Promise<ImageGenerationJob[]> {
		const now = new Date();

		return db
			.select()
			.from(imageGenerationJobs)
			.where(
				or(
					eq(imageGenerationJobs.status, 'PENDING'),
					and(eq(imageGenerationJobs.status, 'RETRYING'), lt(imageGenerationJobs.nextRetryAt, now)),
				),
			)
			.orderBy(imageGenerationJobs.priority, imageGenerationJobs.createdAt)
			.limit(limit);
	}

	/**
	 * 查询超时的任务
	 */
	async findTimeoutJobs(): Promise<ImageGenerationJob[]> {
		const now = new Date();

		return db
			.select()
			.from(imageGenerationJobs)
			.where(
				and(eq(imageGenerationJobs.status, 'RUNNING'), lt(imageGenerationJobs.timeoutAt, now)),
			);
	}

	/**
	 * 更新任务状态
	 */
	async updateStatus(
		id: string,
		status: string,
		additionalData: Partial<ImageGenerationJob> = {},
	): Promise<ImageGenerationJob | undefined> {
		await db
			.update(imageGenerationJobs)
			.set({
				status: status as ImageGenerationJob['status'],
				...additionalData,
				updatedAt: new Date(),
			})
			.where(eq(imageGenerationJobs.id, id));

		return this.findById(id);
	}

	/**
	 * 更新任务
	 */
	async update(
		id: string,
		data: Partial<Omit<ImageGenerationJob, 'id' | 'imageId' | 'createdAt'>>,
	): Promise<ImageGenerationJob | undefined> {
		await db
			.update(imageGenerationJobs)
			.set({
				...data,
				updatedAt: new Date(),
			})
			.where(eq(imageGenerationJobs.id, id));

		return this.findById(id);
	}

	/**
	 * 删除任务
	 */
	async delete(id: string): Promise<boolean> {
		const result = await db.delete(imageGenerationJobs).where(eq(imageGenerationJobs.id, id));
		return (result[0].affectedRows ?? 0) > 0;
	}

	/**
	 * 根据状态查询任务
	 */
	async findByStatus(status: string, limit = 100): Promise<ImageGenerationJob[]> {
		return db
			.select()
			.from(imageGenerationJobs)
			.where(eq(imageGenerationJobs.status, status as ImageGenerationJob['status']))
			.limit(limit);
	}
}

// 导出单例
export const imageJobRepository = new ImageJobRepository();
