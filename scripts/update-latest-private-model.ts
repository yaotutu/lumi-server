import { desc } from 'drizzle-orm';
/**
 * 更新最新的 PRIVATE 模型为 PUBLIC（使用完整ID）
 */
import { db } from '../src/db/drizzle.js';
import { models } from '../src/db/schema/index.js';

async function updateLatestPrivateModel() {
	console.log('🔍 查找最新的 PRIVATE 模型...\n');

	// 查询最新的 PRIVATE 模型
	const latestModels = await db
		.select({
			id: models.id,
			name: models.name,
			visibility: models.visibility,
			completedAt: models.completedAt,
		})
		.from(models)
		.orderBy(desc(models.createdAt))
		.limit(1);

	if (latestModels.length === 0) {
		console.log('❌ 没有找到模型');
		process.exit(1);
	}

	const model = latestModels[0];

	console.log(`找到模型: ${model.name}`);
	console.log(`  ID: ${model.id}`);
	console.log(
		`  当前状态: visibility=${model.visibility}, completedAt=${model.completedAt ? '有' : '无'}\n`,
	);

	if (model.visibility === 'PUBLIC') {
		console.log('✅ 模型已经是 PUBLIC，无需更新');
		process.exit(0);
	}

	console.log('🔄 正在更新为 PUBLIC...\n');

	// 更新模型
	const result = await db
		.update(models)
		.set({
			visibility: 'PUBLIC',
			publishedAt: new Date(),
		})
		.where(db.$with(models.id).as(model.id));

	console.log('✅ 更新完成\n');

	// 验证
	const updated = await db.select().from(models).where(db.$with(models.id).as(model.id));

	console.log('📋 更新后的状态：');
	if (updated.length > 0) {
		console.log(`  visibility: ${updated[0].visibility}`);
		console.log(
			`  publishedAt: ${updated[0].publishedAt ? updated[0].publishedAt.toISOString() : 'NULL'}`,
		);
	}

	process.exit(0);
}

updateLatestPrivateModel().catch((error) => {
	console.error('❌ 错误:', error);
	process.exit(1);
});
