/**
 * 测试 API 响应数据
 * 直接调用 repository 方法,查看返回的数据结构
 */

import { generationRequestRepository } from '../src/repositories/index.js';

const taskId = 'tugjvdgy4ea812x7vszq9kdk';

console.log(`📊 测试任务 ${taskId} 的 API 响应数据\n`);

try {
	// 直接调用 repository 的 findById 方法(API 路由调用的就是这个)
	const result = await generationRequestRepository.findById(taskId);

	if (!result) {
		console.log('❌ 任务不存在');
		process.exit(1);
	}

	console.log('✅ Repository 返回的完整数据:\n');
	console.log(JSON.stringify(result, null, 2));

	console.log('\n━'.repeat(40));
	console.log('\n📦 Model 对象详情:\n');

	if (result.model) {
		console.log('Model ID:', result.model.id);
		console.log('Format:', result.model.format);
		console.log('');
		console.log('modelUrl:', result.model.modelUrl || '❌ 不存在');
		console.log('mtlUrl:', result.model.mtlUrl || '❌ 不存在');
		console.log('textureUrl:', result.model.textureUrl || '❌ 不存在');
		console.log('previewImageUrl:', result.model.previewImageUrl || '❌ 不存在');
		console.log('');

		// 检查 mtlUrl 是否存在于对象中
		const hasModelUrl = 'modelUrl' in result.model;
		const hasMtlUrl = 'mtlUrl' in result.model;
		const hasTextureUrl = 'textureUrl' in result.model;

		console.log('🔍 字段存在性检查:');
		console.log(`  modelUrl 字段存在: ${hasModelUrl ? '✅' : '❌'}`);
		console.log(`  mtlUrl 字段存在: ${hasMtlUrl ? '✅' : '❌'}`);
		console.log(`  textureUrl 字段存在: ${hasTextureUrl ? '✅' : '❌'}`);

		// 检查字段值的类型
		console.log('\n🔍 字段值类型:');
		console.log(`  modelUrl: ${typeof result.model.modelUrl}`);
		console.log(`  mtlUrl: ${typeof result.model.mtlUrl}`);
		console.log(`  textureUrl: ${typeof result.model.textureUrl}`);
	} else {
		console.log('⚠️  该任务没有关联的模型');
	}

	console.log('\n━'.repeat(40));
	console.log('\n🧪 测试 JSON 序列化:\n');

	const jsonString = JSON.stringify(result);
	const includesMtlUrl = jsonString.includes('mtlUrl');
	const includesTextureUrl = jsonString.includes('textureUrl');

	console.log(`JSON 字符串包含 "mtlUrl": ${includesMtlUrl ? '✅' : '❌'}`);
	console.log(`JSON 字符串包含 "textureUrl": ${includesTextureUrl ? '✅' : '❌'}`);

	if (!includesMtlUrl) {
		console.log('\n❌ 警告: JSON 序列化后丢失了 mtlUrl 字段!');
		console.log('这可能是因为:');
		console.log('1. 字段值为 undefined (不是 null)');
		console.log('2. JSON.stringify 的配置过滤了该字段');
	}
} catch (error) {
	console.error('❌ 测试失败:', error);
	throw error;
} finally {
	process.exit(0);
}
