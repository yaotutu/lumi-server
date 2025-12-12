import { eq } from 'drizzle-orm';
/**
 * 详细检查最新模型的状态
 */
import { db } from '../src/db/drizzle.js';
import { models } from '../src/db/schema/index.js';

async function checkModelDetails() {
	const modelId = 'yyjda823lubtv49pjzk5pvph';

	console.log('🔍 检查模型详细信息...\n');

	const model = await db.select().from(models).where(eq(models.id, modelId));

	if (model.length === 0) {
		console.log('❌ 模型不存在');
		process.exit(1);
	}

	const m = model[0];

	console.log('📋 模型详情：');
	console.log(`  ID: ${m.id}`);
	console.log(`  名称: ${m.name}`);
	console.log(`  visibility: ${m.visibility}`);
	console.log(`  modelUrl: ${m.modelUrl || '❌ NULL'}`);
	console.log(`  completedAt: ${m.completedAt ? m.completedAt.toISOString() : '❌ NULL'}`);
	console.log(`  publishedAt: ${m.publishedAt ? m.publishedAt.toISOString() : '❌ NULL'}`);
	console.log(`  createdAt: ${m.createdAt?.toISOString()}`);

	console.log('\n🔍 模型广场过滤条件检查：');
	console.log(`  ✓ visibility === 'PUBLIC': ${m.visibility === 'PUBLIC' ? '✅ 通过' : '❌ 失败'}`);
	console.log(`  ✓ completedAt !== null: ${m.completedAt !== null ? '✅ 通过' : '❌ 失败'}`);
	console.log(`  ✓ publishedAt !== null: ${m.publishedAt !== null ? '✅ 通过' : '❌ 失败'}`);

	const passesFilters =
		m.visibility === 'PUBLIC' && m.completedAt !== null && m.publishedAt !== null;

	console.log(
		`\n${passesFilters ? '✅' : '❌'} 总结: ${passesFilters ? '符合' : '不符合'}模型广场显示条件`,
	);

	process.exit(0);
}

checkModelDetails().catch((error) => {
	console.error('❌ 错误:', error);
	process.exit(1);
});
