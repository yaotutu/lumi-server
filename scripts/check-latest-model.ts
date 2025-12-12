/**
 * 诊断脚本：检查最新的模型记录
 * 用于调试为什么前端还在加载腾讯云 ZIP URL
 */

import { db } from '@/db/drizzle';
import { generationRequests, models, modelGenerationJobs } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

async function checkLatestModel() {
	console.log('🔍 查询最新的生成请求...\n');

	// 查询最近的 5 条生成请求
	const requests = await db
		.select()
		.from(generationRequests)
		.orderBy(desc(generationRequests.createdAt))
		.limit(5);

	if (requests.length === 0) {
		console.log('❌ 没有找到任何生成请求');
		return;
	}

	console.log(`✅ 找到 ${requests.length} 条最近的生成请求\n`);

	for (const request of requests) {
		console.log('━'.repeat(80));
		console.log(`📋 Request ID: ${request.id}`);
		console.log(`   User ID: ${request.userId}`);
		console.log(`   Status: ${request.status}`);
		console.log(`   Phase: ${request.phase}`);
		console.log(`   Created: ${request.createdAt}`);

		// 查询对应的模型记录
		const [modelRecord] = await db
			.select()
			.from(models)
			.where(eq(models.requestId, request.id))
			.limit(1);

		if (modelRecord) {
			console.log('\n   📦 Model 记录:');
			console.log(`      Model ID: ${modelRecord.id}`);
			console.log(`      Format: ${modelRecord.format}`);
			console.log(`      Model URL: ${modelRecord.modelUrl || '(未设置)'}`);
			console.log(`      Preview URL: ${modelRecord.previewImageUrl || '(未设置)'}`);
			console.log(`      Print Status: ${modelRecord.printStatus}`);
			console.log(`      Completed At: ${modelRecord.completedAt || '(未完成)'}`);
			console.log(`      Failed At: ${modelRecord.failedAt || '(未失败)'}`);
			console.log(`      Error: ${modelRecord.errorMessage || '(无错误)'}`);

			// 查询对应的 Job 记录
			const [job] = await db
				.select()
				.from(modelGenerationJobs)
				.where(eq(modelGenerationJobs.modelId, modelRecord.id))
				.limit(1);

			if (job) {
				console.log('\n   🔧 Model Generation Job:');
				console.log(`      Job ID: ${job.id}`);
				console.log(`      Status: ${job.status}`);
				console.log(`      Progress: ${job.progress}%`);
				console.log(`      Provider: ${job.providerName || '(未设置)'}`);
				console.log(`      Provider Job ID: ${job.providerJobId || '(未设置)'}`);
				console.log(`      Retry Count: ${job.retryCount}`);
				console.log(`      Started At: ${job.startedAt || '(未开始)'}`);
				console.log(`      Completed At: ${job.completedAt || '(未完成)'}`);
				console.log(`      Failed At: ${job.failedAt || '(未失败)'}`);
				console.log(`      Error: ${job.errorMessage || '(无错误)'}`);
			} else {
				console.log('\n   ❌ 没有找到对应的 Model Generation Job');
			}

			// 检查 URL 类型
			if (modelRecord.modelUrl) {
				console.log('\n   🔗 URL 分析:');
				if (modelRecord.modelUrl.includes('tencentcos.cn')) {
					console.log('      ⚠️  警告: 仍然是腾讯云 URL!');
					console.log('      这说明 Worker 没有正确处理 ZIP 并上传到 S3');
				} else if (modelRecord.modelUrl.includes('.zip')) {
					console.log('      ⚠️  警告: URL 指向 ZIP 文件!');
					console.log('      这不应该发生，应该是解压后的 model.obj');
				} else if (modelRecord.modelUrl.includes('/models/')) {
					console.log('      ✅ 正确: 这是 S3 存储的 URL');
					console.log('      路径包含 /models/，符合预期');
				} else {
					console.log('      ❓ 未知 URL 格式');
				}
			}
		} else {
			console.log('\n   ❌ 没有找到对应的 Model 记录');
		}

		console.log('\n');
	}

	process.exit(0);
}

checkLatestModel().catch((error) => {
	console.error('❌ 脚本执行失败:', error);
	process.exit(1);
});
