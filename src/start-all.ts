#!/usr/bin/env node

/**
 * 统一启动脚本 - 同时运行 API 和 Worker 服务器
 * 类似于开发环境的 concurrently 命令
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 获取当前文件所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 进程引用（使用类型注解）
let apiProcess: ChildProcess | null = null;
let workerProcess: ChildProcess | null = null;
let isShuttingDown = false;

/**
 * 日志输出工具
 */
const logger = {
	api: (msg: string): void => console.log(`\x1b[36m[API]\x1b[0m ${msg}`),
	worker: (msg: string): void => console.log(`\x1b[35m[Worker]\x1b[0m ${msg}`),
	system: (msg: string): void => console.log(`\x1b[33m[System]\x1b[0m ${msg}`),
	error: (msg: string): void => console.error(`\x1b[31m[Error]\x1b[0m ${msg}`),
};

/**
 * 启动 API 服务器
 */
function startApiServer(): void {
	logger.api('Starting API server...');

	apiProcess = spawn('node', [join(__dirname, 'server.js')], {
		stdio: 'inherit',
		env: { ...process.env, SERVICE_NAME: 'API' },
	});

	apiProcess.on('exit', (code, signal) => {
		if (!isShuttingDown) {
			logger.error(`API server exited with code ${code} and signal ${signal}`);
			shutdown(1);
		}
	});

	apiProcess.on('error', (err) => {
		logger.error(`Failed to start API server: ${err.message}`);
		shutdown(1);
	});
}

/**
 * 启动 Worker 服务器
 */
function startWorkerServer(): void {
	logger.worker('Starting Worker server...');

	workerProcess = spawn('node', [join(__dirname, 'workers/start-workers.js')], {
		stdio: 'inherit',
		env: { ...process.env, SERVICE_NAME: 'Worker' },
	});

	workerProcess.on('exit', (code, signal) => {
		if (!isShuttingDown) {
			logger.error(`Worker server exited with code ${code} and signal ${signal}`);
			shutdown(1);
		}
	});

	workerProcess.on('error', (err) => {
		logger.error(`Failed to start Worker server: ${err.message}`);
		shutdown(1);
	});
}

/**
 * 优雅关闭所有服务
 */
function shutdown(exitCode = 0): void {
	if (isShuttingDown) {
		return;
	}

	isShuttingDown = true;
	logger.system('Shutting down all services...');

	// 发送 SIGTERM 信号给子进程
	if (apiProcess && !apiProcess.killed) {
		logger.api('Stopping API server...');
		apiProcess.kill('SIGTERM');
	}

	if (workerProcess && !workerProcess.killed) {
		logger.worker('Stopping Worker server...');
		workerProcess.kill('SIGTERM');
	}

	// 等待子进程退出，最多等待 10 秒
	setTimeout(() => {
		if (apiProcess && !apiProcess.killed) {
			logger.api('Force killing API server...');
			apiProcess.kill('SIGKILL');
		}

		if (workerProcess && !workerProcess.killed) {
			logger.worker('Force killing Worker server...');
			workerProcess.kill('SIGKILL');
		}

		logger.system('All services stopped');
		process.exit(exitCode);
	}, 10000);

	// 如果子进程都已退出，立即退出
	const checkInterval = setInterval(() => {
		const apiExited = !apiProcess || apiProcess.killed || apiProcess.exitCode !== null;
		const workerExited = !workerProcess || workerProcess.killed || workerProcess.exitCode !== null;

		if (apiExited && workerExited) {
			clearInterval(checkInterval);
			logger.system('All services stopped gracefully');
			process.exit(exitCode);
		}
	}, 100);
}

/**
 * 处理进程信号
 */
function setupSignalHandlers(): void {
	// 处理 SIGTERM (Docker stop)
	process.on('SIGTERM', () => {
		logger.system('Received SIGTERM signal');
		shutdown(0);
	});

	// 处理 SIGINT (Ctrl+C)
	process.on('SIGINT', () => {
		logger.system('Received SIGINT signal');
		shutdown(0);
	});

	// 处理未捕获的异常
	process.on('uncaughtException', (err) => {
		logger.error(`Uncaught exception: ${err.message}`);
		logger.error(err.stack ?? '');
		shutdown(1);
	});

	// 处理未处理的 Promise 拒绝
	process.on('unhandledRejection', (reason) => {
		logger.error(`Unhandled rejection: ${reason}`);
		shutdown(1);
	});
}

/**
 * 主函数
 */
function main(): void {
	logger.system('Lumi Server - Starting all services...');
	logger.system('================================================');

	// 设置信号处理器
	setupSignalHandlers();

	// 启动两个服务器
	startApiServer();
	startWorkerServer();

	logger.system('================================================');
	logger.system('All services started successfully');
	logger.system('Press Ctrl+C to stop all services');
}

// 启动应用
main();
