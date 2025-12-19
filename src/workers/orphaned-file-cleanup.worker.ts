/**
 * S3 孤儿文件清理 Worker
 *
 * 职责：
 * - 定期从 orphaned_files 表查询待清理的文件
 * - 重试删除失败的 S3 文件
 * - 记录清理统计和告警
 *
 * 执行频率：
 * - 默认每小时执行一次
 * - 可通过环境变量 CLEANUP_INTERVAL_HOURS 配置
 */

import { orphanedFileRepository } from '@/repositories';
import { storageService } from '@/services/storage.service';
import { logger } from '@/utils/logger';

/**
 * 清理配置
 */
const CLEANUP_CONFIG = {
	// 清理间隔（小时）- 从环境变量读取，默认 1 小时
	intervalHours: Number.parseInt(process.env.CLEANUP_INTERVAL_HOURS || '1', 10),
	// 每批处理的文件数量
	batchSize: 100,
	// 最大重试次数
	maxRetries: 10,
};

/**
 * 清理统计信息
 */
interface CleanupStats {
	totalFiles: number; // 本次处理的文件总数
	successCount: number; // 删除成功的文件数
	failedCount: number; // 删除失败的文件数
	maxRetriesReached: number; // 达到最大重试次数的文件数
}

/**
 * 执行一次清理任务
 */
async function runCleanup(): Promise<CleanupStats> {
	const stats: CleanupStats = {
		totalFiles: 0,
		successCount: 0,
		failedCount: 0,
		maxRetriesReached: 0,
	};

	try {
		// 1. 查询待清理的孤儿文件
		const orphanedFiles = await orphanedFileRepository.findPending(
			CLEANUP_CONFIG.batchSize,
			CLEANUP_CONFIG.maxRetries,
		);

		stats.totalFiles = orphanedFiles.length;

		if (orphanedFiles.length === 0) {
			logger.info({ msg: '✅ 没有待清理的孤儿文件' });
			return stats;
		}

		logger.info({
			msg: '🧹 开始清理孤儿文件',
			totalFiles: orphanedFiles.length,
		});

		// 2. 逐个尝试删除
		for (const file of orphanedFiles) {
			try {
				// 尝试从 S3 删除
				await storageService.delete(file.s3Key);

				// 删除成功 - 标记为已删除
				await orphanedFileRepository.markAsDeleted(file.id);
				stats.successCount++;

				logger.info({
					msg: '✅ 孤儿文件删除成功',
					fileId: file.id,
					s3Key: file.s3Key,
					retryCount: file.retryCount,
				});
			} catch (error) {
				// 删除失败 - 增加重试计数
				await orphanedFileRepository.incrementRetry(file.id);
				stats.failedCount++;

				// 检查是否达到最大重试次数
				if (file.retryCount + 1 >= CLEANUP_CONFIG.maxRetries) {
					stats.maxRetriesReached++;
					logger.error({
						msg: '⚠️ 孤儿文件达到最大重试次数，需人工处理',
						fileId: file.id,
						s3Key: file.s3Key,
						retryCount: file.retryCount + 1,
						requestId: file.requestId,
						error:
							error instanceof Error
								? {
										message: error.message,
										name: error.name,
									}
								: error,
					});
				} else {
					logger.warn({
						msg: '⚠️ 孤儿文件删除失败，将继续重试',
						fileId: file.id,
						s3Key: file.s3Key,
						retryCount: file.retryCount + 1,
						error:
							error instanceof Error
								? {
										message: error.message,
										name: error.name,
									}
								: error,
					});
				}
			}
		}

		// 3. 记录清理统计
		logger.info({
			msg: '✅ 孤儿文件清理完成',
			stats,
		});

		return stats;
	} catch (error) {
		logger.error({
			msg: '❌ 孤儿文件清理任务失败',
			error:
				error instanceof Error
					? {
							message: error.message,
							stack: error.stack,
							name: error.name,
						}
					: error,
		});
		return stats;
	}
}

/**
 * 启动定期清理任务
 * @returns 清理任务的 Timer ID（用于停止任务）
 */
export function startOrphanedFileCleanup(): NodeJS.Timeout {
	const intervalMs = CLEANUP_CONFIG.intervalHours * 60 * 60 * 1000;

	logger.info({
		msg: '🧹 启动孤儿文件清理定时任务',
		intervalHours: CLEANUP_CONFIG.intervalHours,
		batchSize: CLEANUP_CONFIG.batchSize,
		maxRetries: CLEANUP_CONFIG.maxRetries,
	});

	// 立即执行一次清理
	runCleanup().catch((error) => {
		logger.error({ msg: '❌ 初始清理任务失败', error });
	});

	// 定期执行清理
	const timer = setInterval(() => {
		runCleanup().catch((error) => {
			logger.error({ msg: '❌ 定期清理任务失败', error });
		});
	}, intervalMs);

	return timer;
}

/**
 * 停止清理任务
 * @param timer Timer ID
 */
export function stopOrphanedFileCleanup(timer: NodeJS.Timeout): void {
	clearInterval(timer);
	logger.info({ msg: '✅ 孤儿文件清理定时任务已停止' });
}
