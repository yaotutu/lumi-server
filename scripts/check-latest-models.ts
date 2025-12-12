import { desc } from 'drizzle-orm';
/**
 * 检查最新创建的模型状态
 */
import { db } from '../src/db/drizzle.js';
import { models } from '../src/db/schema/index.js';

async function checkLatestModels() {
	console.log('🔍 查询最新的5个模型...\n');

	const latestModels = await db
		.select({
			id: models.id,
			name: models.name,
			visibility: models.visibility,
			completedAt: models.completedAt,
			publishedAt: models.publishedAt,
			modelUrl: models.modelUrl,
			createdAt: models.createdAt,
		})
		.from(models)
		.orderBy(desc(models.createdAt))
		.limit(5);

	console.log('📋 最新模型列表：\n');
	console.table(
		latestModels.map((model) => ({
			id: model.id.substring(0, 12) + '...',
			name: model.name,
			visibility: model.visibility,
			hasModelUrl: model.modelUrl ? '✅ 有' : '❌ 无',
			completedAt: model.completedAt ? model.completedAt.toISOString() : '❌ NULL',
			publishedAt: model.publishedAt ? model.publishedAt.toISOString() : '❌ NULL',
			createdAt: model.createdAt?.toISOString(),
		})),
	);

	// 检查模型广场的过滤条件
	console.log('\n🔍 检查模型广场过滤条件：\n');

	const publicCompletedModels = latestModels.filter(
		(m) => m.visibility === 'PUBLIC' && m.completedAt !== null,
	);

	console.log(`✅ 符合模型广场条件的模型数量: ${publicCompletedModels.length}`);

	if (publicCompletedModels.length > 0) {
		console.log('\n符合条件的模型：');
		publicCompletedModels.forEach((m) => {
			console.log(`  - ${m.name} (ID: ${m.id.substring(0, 12)}...)`);
		});
	}

	const failedModels = latestModels.filter(
		(m) => m.visibility !== 'PUBLIC' || m.completedAt === null,
	);

	if (failedModels.length > 0) {
		console.log('\n❌ 不符合条件的模型：');
		failedModels.forEach((m) => {
			const reasons = [];
			if (m.visibility !== 'PUBLIC') {
				reasons.push(`visibility=${m.visibility} (需要PUBLIC)`);
			}
			if (m.completedAt === null) {
				reasons.push('completedAt=NULL (需要设置完成时间)');
			}
			console.log(`  - ${m.name} (ID: ${m.id.substring(0, 12)}...)`);
			console.log(`    原因: ${reasons.join(', ')}`);
		});
	}

	process.exit(0);
}

checkLatestModels().catch((error) => {
	console.error('❌ 错误:', error);
	process.exit(1);
});
