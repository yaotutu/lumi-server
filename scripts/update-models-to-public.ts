import { db } from '../src/db/drizzle.js';
import { models } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../src/utils/logger.js';

/**
 * 临时脚本：将所有 PRIVATE 模型更新为 PUBLIC
 */
async function updateModelsToPublic() {
	try {
		logger.info('开始更新所有模型为 PUBLIC...');

		const result = await db
			.update(models)
			.set({
				visibility: 'PUBLIC',
				publishedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(models.visibility, 'PRIVATE'));

		const affectedRows = result[0].affectedRows ?? 0;
		logger.info({ affectedRows }, `✅ 成功更新 ${affectedRows} 个模型为 PUBLIC`);

		process.exit(0);
	} catch (error) {
		logger.error({ error }, '❌ 更新失败');
		process.exit(1);
	}
}

updateModelsToPublic();
