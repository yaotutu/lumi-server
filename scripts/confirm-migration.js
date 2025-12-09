#!/usr/bin/env node
/**
 * 自动确认 Drizzle 数据库迁移
 * 使用方向键和回车模拟用户选择 "Yes"
 */
import { spawn } from 'node:child_process';

const proc = spawn('npx', ['drizzle-kit', 'push'], {
	stdio: ['pipe', 'inherit', 'inherit'],
});

// 等待提示符出现后自动选择 "Yes"
setTimeout(() => {
	// 按下方向键向下移动到 "Yes, I want to execute all statements"
	proc.stdin.write('\x1B[B'); // 向下箭头键 (ESC + [B)

	// 延迟一下再按回车
	setTimeout(() => {
		proc.stdin.write('\n'); // 回车确认
		proc.stdin.end();
	}, 500);
}, 3000);

proc.on('close', (code) => {
	process.exit(code);
});
