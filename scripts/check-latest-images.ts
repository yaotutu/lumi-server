/**
 * 检查最新生成的图片URL
 */
import { db } from '../src/db/drizzle.js';
import { generatedImages } from '../src/db/schema/index.js';
import { desc } from 'drizzle-orm';

async function checkLatestImages() {
	console.log('🔍 查询最新的5张图片...\n');

	const images = await db
		.select({
			id: generatedImages.id,
			imageUrl: generatedImages.imageUrl,
			imageStatus: generatedImages.imageStatus,
			createdAt: generatedImages.createdAt,
		})
		.from(generatedImages)
		.orderBy(desc(generatedImages.createdAt))
		.limit(5);

	console.log('📋 结果：');
	console.table(
		images.map((img) => ({
			id: img.id.substring(0, 12) + '...',
			imageUrl: img.imageUrl || 'NULL',
			imageStatus: img.imageStatus,
			createdAt: img.createdAt?.toISOString(),
			isS3Url: img.imageUrl?.includes('ai3d-1375240212.cos.ap-guangzhou.myqcloud.com')
				? '✅ 是S3'
				: '❌ 外部URL',
		})),
	);

	process.exit(0);
}

checkLatestImages().catch((error) => {
	console.error('❌ 错误:', error);
	process.exit(1);
});
