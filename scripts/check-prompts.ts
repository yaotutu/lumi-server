// 临时脚本：检查数据库中的 prompt 数据

import { desc } from 'drizzle-orm';
import { db } from '../src/db/drizzle.js';
import { generationRequests } from '../src/db/schema/index.js';

const requests = await db
	.select({
		id: generationRequests.id,
		prompt: generationRequests.prompt,
		status: generationRequests.status,
		phase: generationRequests.phase,
	})
	.from(generationRequests)
	.orderBy(desc(generationRequests.createdAt))
	.limit(3);

console.log('=== 最近 3 条生成请求的 prompt ===\n');
for (const req of requests) {
	console.log(`ID: ${req.id}`);
	console.log(`Status: ${req.status}`);
	console.log(`Phase: ${req.phase}`);
	console.log(`Prompt: ${req.prompt}\n`);
	console.log('---\n');
}

process.exit(0);
