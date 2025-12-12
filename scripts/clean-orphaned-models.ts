import { db } from '../src/db/drizzle.js';
import { models } from '../src/db/schema/index.js';
import { sql } from 'drizzle-orm';
import { logger } from '../src/utils/logger.js';

/**
 * 清理孤立的模型（关联的 generation_request 已被删除）
 */
async function cleanOrphanedModels() {
	try {
		logger.info('开始清理孤立模型...');

		// 删除孤立的模型（LEFT JOIN 后 generation_requests.id 为 NULL 的记录）
		const result = await db.execute(sql`
			DELETE m FROM models m
			LEFT JOIN generation_requests gr ON m.request_id = gr.id
			WHERE gr.id IS NULL
		`);

		const affectedRows = result[0].affectedRows ?? 0;
		logger.info({ affectedRows }, `✅ 成功清理 ${affectedRows} 个孤立模型`);

		process.exit(0);
	} catch (error) {
		logger.error({ error }, '❌ 清理失败');
		process.exit(1);
	}
}

cleanOrphanedModels();
