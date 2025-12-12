/**
 * 检查特定任务的详细数据
 */

import { db } from '../src/db/drizzle.js';
import { generationRequests, models } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

const taskId = 'tugjvdgy4ea812x7vszq9kdk';

console.log(`📊 检查任务: ${taskId}\n`);

try {
	// 1. 查询 GenerationRequest
	const [request] = await db
		.select()
		.from(generationRequests)
		.where(eq(generationRequests.id, taskId))
		.limit(1);

	if (!request) {
		console.log('❌ 任务不存在');
		process.exit(1);
	}

	console.log('✅ 任务信息:');
	console.log('ID:', request.id);
	console.log('用户ID:', request.userId);
	console.log('提示词:', request.prompt);
	console.log('阶段:', request.phase);
	console.log('状态:', request.status);
	console.log('创建时间:', request.createdAt);
	console.log('选择的图片索引:', request.selectedImageIndex);
	console.log('');

	// 2. 查询关联的 Model
	const [model] = await db.select().from(models).where(eq(models.requestId, taskId)).limit(1);

	if (!model) {
		console.log('⚠️  该任务还没有关联的模型');
		process.exit(0);
	}

	console.log('📦 模型信息:');
	console.log('ID:', model.id);
	console.log('格式:', model.format);
	console.log('创建时间:', model.createdAt);
	console.log('完成时间:', model.completedAt || '❌ 未完成');
	console.log('');

	console.log('🔗 URL 数据:');
	console.log('modelUrl:  ', model.modelUrl || '❌ NULL');
	console.log('mtlUrl:    ', model.mtlUrl || '❌ NULL');
	console.log('textureUrl:', model.textureUrl || '❌ NULL');
	console.log('');

	// 检查模型创建时间
	if (model.createdAt) {
		const now = new Date();
		const createdMinutesAgo = Math.floor(
			(now.getTime() - model.createdAt.getTime()) / 1000 / 60,
		);
		console.log(`⏰ 模型创建于 ${createdMinutesAgo} 分钟前`);

		// 代码修复时间大约是 2024-12-12 17:50
		const fixTime = new Date('2024-12-12T17:50:00+08:00');
		if (model.createdAt < fixTime) {
			console.log('⚠️  这个模型是在代码修复之前创建的！');
			console.log('   请生成一个新任务来测试修复后的功能。');
		} else {
			console.log('✅ 这个模型是在代码修复之后创建的。');
			if (!model.mtlUrl && model.format === 'OBJ') {
				console.log('❌ 但是 mtlUrl 仍然为 NULL，可能存在其他问题！');
			}
		}
	}
} catch (error) {
	console.error('❌ 查询失败:', error);
	throw error;
} finally {
	process.exit(0);
}
