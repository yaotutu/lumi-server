import { db } from '@/db/drizzle';
import {
	type ModelGenerationJob,
	type NewModelGenerationJob,
	modelGenerationJobs,
} from '@/db/schema';
import { and, eq, lt, or } from 'drizzle-orm';

/**
 * ModelGenerationJob Repository
 * 模型生成任务数据访问层
 */
export class ModelJobRepository {
	/**
	 * 创建任务
	 */
	async create(data: NewModelGenerationJob): Promise<ModelGenerationJob> {
		await db.insert(modelGenerationJobs).values(data);
		const job = await this.findById(data.id as string);
		if (!job) {
			throw new Error('Failed to create model generation job');
		}
		return job;
	}

	/**
	 * 根据 ID 查询任务
	 */
	async findById(id: string): Promise<ModelGenerationJob | undefined> {
		const [job] = await db
			.select()
			.from(modelGenerationJobs)
			.where(eq(modelGenerationJobs.id, id))
			.limit(1);
		return job;
	}

	/**
	 * 根据模型 ID 查询任务
	 */
	async findByModelId(modelId: string): Promise<ModelGenerationJob | undefined> {
		const [job] = await db
			.select()
			.from(modelGenerationJobs)
			.where(eq(modelGenerationJobs.modelId, modelId))
			.limit(1);
		return job;
	}

	/**
	 * 查询待处理的任务（PENDING + 已到达重试时间的 RETRYING）
	 */
	async findPendingJobs(limit = 100): Promise<ModelGenerationJob[]> {
		const now = new Date();

		return db
			.select()
			.from(modelGenerationJobs)
			.where(
				or(
					eq(modelGenerationJobs.status, 'PENDING'),
					and(eq(modelGenerationJobs.status, 'RETRYING'), lt(modelGenerationJobs.nextRetryAt, now)),
				),
			)
			.orderBy(modelGenerationJobs.priority, modelGenerationJobs.createdAt)
			.limit(limit);
	}

	/**
	 * 查询超时的任务
	 */
	async findTimeoutJobs(): Promise<ModelGenerationJob[]> {
		const now = new Date();

		return db
			.select()
			.from(modelGenerationJobs)
			.where(
				and(eq(modelGenerationJobs.status, 'RUNNING'), lt(modelGenerationJobs.timeoutAt, now)),
			);
	}

	/**
	 * 更新任务状态
	 */
	async updateStatus(
		id: string,
		status: string,
		additionalData: Partial<ModelGenerationJob> = {},
	): Promise<ModelGenerationJob | undefined> {
		await db
			.update(modelGenerationJobs)
			.set({
				status: status as ModelGenerationJob['status'],
				...additionalData,
				updatedAt: new Date(),
			})
			.where(eq(modelGenerationJobs.id, id));

		return this.findById(id);
	}

	/**
	 * 更新任务进度
	 */
	async updateProgress(id: string, progress: number): Promise<void> {
		await db
			.update(modelGenerationJobs)
			.set({
				progress,
				updatedAt: new Date(),
			})
			.where(eq(modelGenerationJobs.id, id));
	}

	/**
	 * 更新任务
	 */
	async update(
		id: string,
		data: Partial<Omit<ModelGenerationJob, 'id' | 'modelId' | 'createdAt'>>,
	): Promise<ModelGenerationJob | undefined> {
		await db
			.update(modelGenerationJobs)
			.set({
				...data,
				updatedAt: new Date(),
			})
			.where(eq(modelGenerationJobs.id, id));

		return this.findById(id);
	}

	/**
	 * 删除任务
	 */
	async delete(id: string): Promise<boolean> {
		const result = await db.delete(modelGenerationJobs).where(eq(modelGenerationJobs.id, id));
		return (result[0].affectedRows ?? 0) > 0;
	}

	/**
	 * 根据状态查询任务
	 */
	async findByStatus(status: string, limit = 100): Promise<ModelGenerationJob[]> {
		return db
			.select()
			.from(modelGenerationJobs)
			.where(eq(modelGenerationJobs.status, status as ModelGenerationJob['status']))
			.limit(limit);
	}
}

// 导出单例
export const modelJobRepository = new ModelJobRepository();
