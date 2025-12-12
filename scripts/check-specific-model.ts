import { db } from '../src/db/drizzle.js';
import { models } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

const modelId = 'y3zhdon85i8hli0uxaxm6h2n';

const [model] = await db
	.select({
		id: models.id,
		format: models.format,
		modelUrl: models.modelUrl,
		mtlUrl: models.mtlUrl,
		textureUrl: models.textureUrl,
		createdAt: models.createdAt,
		completedAt: models.completedAt,
	})
	.from(models)
	.where(eq(models.id, modelId))
	.limit(1);

if (!model) {
	console.log('❌ 模型不存在:', modelId);
	process.exit(1);
}

console.log('📦 模型详情:');
console.log('ID:', model.id);
console.log('格式:', model.format);
console.log('创建时间:', model.createdAt);
console.log('完成时间:', model.completedAt);
console.log('');
console.log('🔗 URL 数据:');
console.log('modelUrl:', model.modelUrl || '❌ NULL');
console.log('mtlUrl:', model.mtlUrl || '❌ NULL');
console.log('textureUrl:', model.textureUrl || '❌ NULL');

// 比较创建时间和当前时间
const now = new Date();
const createdMinutesAgo = Math.floor((now.getTime() - model.createdAt.getTime()) / 1000 / 60);
console.log('');
console.log(`⏰ 模型创建于 ${createdMinutesAgo} 分钟前`);

if (createdMinutesAgo > 10) {
	console.log('⚠️  这个模型是在代码修改之前创建的，请生成一个新模型来测试');
}

process.exit(0);
