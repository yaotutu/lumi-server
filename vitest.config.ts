import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// 测试文件匹配模式 - 只在 test 目录下查找
		include: ['test/**/*.test.{js,ts}'],
		exclude: ['node_modules', 'dist'],

		// 测试环境
		environment: 'node',

		// 全局设置
		globals: true,

		// 测试超时时间
		testTimeout: 10000,
	},

	// 路径别名解析，与项目保持一致
	resolve: {
		alias: {
			'@': new URL('./src', import.meta.url).pathname,
		},
	},
});
