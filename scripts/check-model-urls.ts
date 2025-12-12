/**
 * 检查数据库中模型的 URL 数据
 * 用于调试为什么 MTL 文件没有传递到前端
 */

import { db } from '../src/db/drizzle.js';
import { models } from '../src/db/schema/index.js';
import { desc, eq } from 'drizzle-orm';

async function checkModelUrls() {
	console.log('📊 开始检查模型 URL 数据...\n');

	try {
		// 查询最近5个 OBJ 格式的模型
		const objModels = await db
			.select({
				id: models.id,
				format: models.format,
				modelUrl: models.modelUrl,
				mtlUrl: models.mtlUrl,
				textureUrl: models.textureUrl,
				completedAt: models.completedAt,
				createdAt: models.createdAt,
			})
			.from(models)
			.where(eq(models.format, 'OBJ'))
			.orderBy(desc(models.createdAt))
			.limit(5);

		console.log(`✅ 找到 ${objModels.length} 个 OBJ 格式的模型\n`);

		for (const model of objModels) {
			console.log('━'.repeat(80));
			console.log(`📦 模型 ID: ${model.id}`);
			console.log(`📅 创建时间: ${model.createdAt}`);
			console.log(`✅ 完成时间: ${model.completedAt || '未完成'}`);
			console.log(`📄 格式: ${model.format}`);
			console.log(`\n🔗 URL 数据:`);
			console.log(`  modelUrl:   ${model.modelUrl || '❌ NULL'}`);
			console.log(`  mtlUrl:     ${model.mtlUrl || '❌ NULL'}`);
			console.log(`  textureUrl: ${model.textureUrl || '❌ NULL'}`);
			console.log('');
		}

		console.log('━'.repeat(80));
		console.log('\n📈 统计结果:');
		const hasModelUrl = objModels.filter((m) => m.modelUrl).length;
		const hasMtlUrl = objModels.filter((m) => m.mtlUrl).length;
		const hasTextureUrl = objModels.filter((m) => m.textureUrl).length;

		console.log(`  有 modelUrl:   ${hasModelUrl}/${objModels.length}`);
		console.log(`  有 mtlUrl:     ${hasMtlUrl}/${objModels.length}`);
		console.log(`  有 textureUrl: ${hasTextureUrl}/${objModels.length}`);

		if (hasMtlUrl === 0 && objModels.length > 0) {
			console.log('\n⚠️  警告: 所有 OBJ 模型都没有 mtlUrl 数据！');
			console.log('这可能是因为：');
			console.log('1. 这些模型是在添加 mtlUrl 字段之前生成的');
			console.log('2. Worker 没有正确保存 mtlUrl 到数据库');
			console.log('3. 数据库迁移可能有问题');
		}

		// 查询所有格式的模型统计
		console.log('\n📊 所有格式模型统计:');
		const allModels = await db.select({ format: models.format }).from(models);

		const formatCounts = allModels.reduce(
			(acc, m) => {
				const format = m.format || 'UNKNOWN';
				acc[format] = (acc[format] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);

		for (const [format, count] of Object.entries(formatCounts)) {
			console.log(`  ${format}: ${count}`);
		}
	} catch (error) {
		console.error('❌ 查询失败:', error);
		throw error;
	} finally {
		process.exit(0);
	}
}

checkModelUrls();
