import { eq } from 'drizzle-orm';
/**
 * 更新所有 PRIVATE 模型为 PUBLIC
 */
import { db } from '../src/db/drizzle.js';
import { models } from '../src/db/schema/index.js';

async function updateAllPrivateModels() {
	console.log('🔍 查找所有 PRIVATE 模型...\n');

	// 查询所有 PRIVATE 模型
	const privateModels = await db
		.select({
			id: models.id,
			name: models.name,
		})
		.from(models)
		.where(eq(models.visibility, 'PRIVATE'));

	console.log(`找到 ${privateModels.length} 个 PRIVATE 模型\n`);

	if (privateModels.length === 0) {
		console.log('✅ 没有需要更新的模型');
		process.exit(0);
	}

	// 逐个更新
	for (const model of privateModels) {
		console.log(`更新: ${model.name} (ID: ${model.id.substring(0, 12)}...)`);

		await db
			.update(models)
			.set({
				visibility: 'PUBLIC',
				publishedAt: new Date(),
			})
			.where(eq(models.id, model.id));
	}

	console.log(`\n✅ 已更新 ${privateModels.length} 个模型为 PUBLIC`);

	process.exit(0);
}

updateAllPrivateModels().catch((error) => {
	console.error('❌ 错误:', error);
	process.exit(1);
});
