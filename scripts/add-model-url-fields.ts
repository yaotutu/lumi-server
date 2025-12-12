/**
 * 数据库迁移脚本：添加 mtl_url 和 texture_url 字段到 models 表
 *
 * 执行方式：npx tsx scripts/add-model-url-fields.ts
 */

import { sql } from 'drizzle-orm';
import { db } from '../src/db/drizzle.js';
import { logger } from '../src/utils/logger.js';

async function migrate() {
	try {
		logger.info({ msg: '开始执行数据库迁移：添加 mtl_url 和 texture_url 字段' });

		// 添加 mtl_url 字段
		await db.execute(sql`
			ALTER TABLE models
			ADD COLUMN mtl_url VARCHAR(500) AFTER model_url
		`);

		logger.info({ msg: '✅ mtl_url 字段添加成功' });

		// 添加 texture_url 字段
		await db.execute(sql`
			ALTER TABLE models
			ADD COLUMN texture_url VARCHAR(500) AFTER mtl_url
		`);

		logger.info({ msg: '✅ texture_url 字段添加成功' });

		logger.info({ msg: '🎉 数据库迁移完成！' });

		process.exit(0);
	} catch (error) {
		logger.error({ msg: '❌ 数据库迁移失败', error });

		// 检查是否是字段已存在的错误
		if (error instanceof Error && error.message.includes('Duplicate column name')) {
			logger.info({ msg: '⚠️ 字段已存在，跳过迁移' });
			process.exit(0);
		}

		process.exit(1);
	}
}

migrate();
