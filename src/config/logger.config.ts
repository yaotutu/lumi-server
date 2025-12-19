/**
 * 日志配置
 * 统一管理 Pino 和 Pino-Pretty 的配置选项
 *
 * 双输出策略：
 * - 控制台：简洁格式，单行显示，方便实时监控
 * - 文件：完整 JSON，保留所有信息，方便事后分析
 *
 * 注意：由于 Pino 使用 worker 线程，customPrettifiers 中的函数无法序列化
 * 因此采用以下策略：
 * 1. 控制台单行显示（singleLine: true）- 减少垂直空间
 * 2. 文件完整记录 - 保留所有信息
 * 3. 在代码层面记录日志时控制字段选择（只记录必要字段）
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrettyOptions } from 'pino-pretty';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 自定义 transport 的绝对路径
const customTransportPath = join(__dirname, '../transports/pino-pretty-console.js');

/**
 * 控制台输出配置（简洁格式）
 * - 单行显示
 * - 彩色高亮
 */
export const pinoPrettyOptionsForConsole: PrettyOptions = {
	// 单行显示（核心优化）
	singleLine: true,

	// 彩色输出
	colorize: true,

	// 简化时间格式
	translateTime: 'HH:MM:ss',

	// 隐藏不必要的字段
	ignore: 'pid,hostname',
};

/**
 * 文件输出配置（完整 JSON）
 * - 保留所有字段
 * - JSON 格式，方便解析
 * - 不截断任何内容
 */
export const pinoFileOptions = {
	destination: './logs/app.log',
	mkdir: true,
};

/**
 * Fastify 专用的控制台配置
 * 在通用配置基础上，额外隐藏详细的请求/响应头
 */
export const fastifyPinoPrettyOptionsForConsole: PrettyOptions = {
	...pinoPrettyOptionsForConsole,
	ignore: 'pid,hostname,req.headers,res.headers',
};

/**
 * Pino 双输出配置（开发环境）
 * targets 数组配置多个输出目标
 */
export const loggerTransport = {
	targets: [
		{
			// 目标 1：控制台（简洁格式）
			target: 'pino-pretty',
			level: 'info',
			options: pinoPrettyOptionsForConsole,
		},
		{
			// 目标 2：文件（完整 JSON）
			target: 'pino/file',
			level: 'debug', // 文件记录 debug 级别及以上
			options: pinoFileOptions,
		},
	],
};

/**
 * Fastify 专用的双输出配置
 */
export const fastifyLoggerTransport = {
	targets: [
		{
			// 目标 1：控制台（简洁格式，隐藏请求头）
			target: 'pino-pretty',
			level: 'info',
			options: fastifyPinoPrettyOptionsForConsole,
		},
		{
			// 目标 2：文件（完整 JSON）
			target: 'pino/file',
			level: 'debug',
			options: pinoFileOptions,
		},
	],
};
