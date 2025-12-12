import { db } from '../src/db/drizzle.js';
import { generationRequests, models } from '../src/db/schema/index.js';
import { sql } from 'drizzle-orm';
import { logger } from '../src/utils/logger.js';

/**
 * 检查孤立的模型（关联的 generation_request 已被删除）
 */
async function checkOrphanedModels() {
	try {
		// 1. 统计 generation_requests 表的记录数
		const [requestCount] = await db
			.select({ count: sql<number>`count(*)` })
			.from(generationRequests);

		logger.info({ count: requestCount.count }, '📊 生成请求（任务）总数');

		// 2. 统计 models 表的记录数
		const [modelCount] = await db
			.select({ count: sql<number>`count(*)` })
			.from(models);

		logger.info({ count: modelCount.count }, '📊 模型总数');

		// 3. 查找孤立的模型（request_id 不存在于 generation_requests 中）
		const orphanedModels = await db.execute(sql`
			SELECT m.id, m.name, m.request_id, m.created_at
			FROM models m
			LEFT JOIN generation_requests gr ON m.request_id = gr.id
			WHERE gr.id IS NULL
		`);

		logger.info({ count: orphanedModels.length }, '🔍 孤立模型数量（关联的任务已删除）');

		if (orphanedModels.length > 0) {
			logger.info({ models: orphanedModels }, '孤立模型列表：');
		}

		// 4. 查看所有 models 的 request_id
		const allModels = await db
			.select({
				id: models.id,
				name: models.name,
				requestId: models.requestId,
			})
			.from(models);

		logger.info({ models: allModels }, '所有模型的 request_id：');

		process.exit(0);
	} catch (error) {
		logger.error({ error }, '❌ 检查失败');
		process.exit(1);
	}
}

checkOrphanedModels();
