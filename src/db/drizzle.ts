import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import * as schema from './schema/index.js';

// 创建 MySQL 连接池
const pool = mysql.createPool({
	uri: config.database.url,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
});

// 创建 Drizzle 实例
export const db = drizzle(pool, {
	schema,
	mode: 'default',
	logger: config.isDevelopment,
});

// 测试数据库连接
export async function testConnection(): Promise<boolean> {
	try {
		const connection = await pool.getConnection();
		await connection.ping();
		connection.release();
		logger.info('✅ Database connected successfully');
		return true;
	} catch (error) {
		logger.error({ error }, '❌ Database connection failed');
		return false;
	}
}

// 优雅关闭
export async function closeDatabase(): Promise<void> {
	await pool.end();
	logger.info('Database connection closed');
}
