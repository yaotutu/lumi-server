import { eq } from 'drizzle-orm';
/**
 * 更新最新的 PRIVATE 模型为 PUBLIC
 */
import { db } from '../src/db/drizzle.js';
import { models } from '../src/db/schema/index.js';

async function updateLatestModel() {
	// 最新的 PRIVATE 模型 ID
	const modelId = 'yyjda823lubtv49pjzk5pvph';

	console.log('🔄 正在更新模型状态...\n');

	// 更新模型为 PUBLIC 并设置 publishedAt
	await db
		.update(models)
		.set({
			visibility: 'PUBLIC',
			publishedAt: new Date(),
		})
		.where(eq(models.id, modelId));

	console.log('✅ 模型已更新为 PUBLIC\n');

	// 验证更新
	const updatedModel = await db
		.select({
			id: models.id,
			name: models.name,
			visibility: models.visibility,
			publishedAt: models.publishedAt,
		})
		.from(models)
		.where(eq(models.id, modelId));

	if (updatedModel.length > 0) {
		console.log('📋 更新后的模型信息：');
		console.table(updatedModel);
	}

	process.exit(0);
}

updateLatestModel().catch((error) => {
	console.error('❌ 错误:', error);
	process.exit(1);
});
