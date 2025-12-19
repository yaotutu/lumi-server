import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { type NewOrphanedFile, type OrphanedFile, orphanedFiles } from '@/db/schema';

/**
 * OrphanedFile Repository
 * S3 孤儿文件数据访问层
 */
export class OrphanedFileRepository {
	/**
	 * 批量创建孤儿文件记录
	 * @param files 文件列表 { s3Key, requestId? }
	 */
	async batchCreate(files: Array<Pick<NewOrphanedFile, 's3Key' | 'requestId'>>): Promise<void> {
		if (files.length === 0) return;

		const records: NewOrphanedFile[] = files.map((file) => ({
			s3Key: file.s3Key,
			requestId: file.requestId,
		}));

		await db.insert(orphanedFiles).values(records);
	}

	/**
	 * 查询待清理的孤儿文件
	 * @param limit 最大返回数量
	 * @param maxRetries 最大重试次数（默认 10）
	 * @returns 待清理的文件列表
	 */
	async findPending(limit = 100, maxRetries = 10): Promise<OrphanedFile[]> {
		return db
			.select()
			.from(orphanedFiles)
			.where(and(eq(orphanedFiles.status, 'pending'), lt(orphanedFiles.retryCount, maxRetries)))
			.orderBy(orphanedFiles.createdAt)
			.limit(limit);
	}

	/**
	 * 根据 ID 查询孤儿文件
	 */
	async findById(id: string): Promise<OrphanedFile | undefined> {
		const [file] = await db.select().from(orphanedFiles).where(eq(orphanedFiles.id, id)).limit(1);
		return file;
	}

	/**
	 * 标记文件已删除
	 * @param id 文件 ID
	 */
	async markAsDeleted(id: string): Promise<void> {
		await db
			.update(orphanedFiles)
			.set({
				status: 'deleted',
			})
			.where(eq(orphanedFiles.id, id));
	}

	/**
	 * 增加重试计数
	 * @param id 文件 ID
	 */
	async incrementRetry(id: string): Promise<void> {
		const file = await this.findById(id);
		if (!file) return;

		await db
			.update(orphanedFiles)
			.set({
				retryCount: file.retryCount + 1,
				lastRetryAt: new Date(),
			})
			.where(eq(orphanedFiles.id, id));
	}

	/**
	 * 查询超过最大重试次数的文件（用于告警）
	 * @param maxRetries 最大重试次数
	 */
	async findFailedFiles(maxRetries = 10): Promise<OrphanedFile[]> {
		return db
			.select()
			.from(orphanedFiles)
			.where(and(eq(orphanedFiles.status, 'pending'), eq(orphanedFiles.retryCount, maxRetries)))
			.orderBy(orphanedFiles.createdAt);
	}

	/**
	 * 获取孤儿文件统计信息
	 */
	async getStats(): Promise<{
		pending: number;
		deleted: number;
		failed: number;
	}> {
		const [pendingResult] = await db
			.select()
			.from(orphanedFiles)
			.where(eq(orphanedFiles.status, 'pending'));

		const [deletedResult] = await db
			.select()
			.from(orphanedFiles)
			.where(eq(orphanedFiles.status, 'deleted'));

		const failedFiles = await this.findFailedFiles();

		return {
			pending: pendingResult ? 1 : 0,
			deleted: deletedResult ? 1 : 0,
			failed: failedFiles.length,
		};
	}
}

// 导出单例
export const orphanedFileRepository = new OrphanedFileRepository();
