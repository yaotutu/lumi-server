import pino from 'pino';
import { config } from '../config/index.js';
import { loggerTransport } from '../config/logger.config.js';

export const logger = pino({
	level: config.logger.level,
	transport: config.isDevelopment ? loggerTransport : undefined,
	timestamp: pino.stdTimeFunctions.isoTime,
	// 限制对象深度和属性数量，防止日志过长
	depthLimit: 3, // 限制嵌套深度为 3 层（默认 5）
	edgeLimit: 20, // 限制属性/元素数量为 20（默认 100）
});
