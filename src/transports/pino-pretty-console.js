/**
 * 自定义 Pino Pretty 控制台传输
 * 用于支持 customPrettifiers 函数（解决 worker 线程序列化问题）
 *
 * 为什么需要这个文件？
 * - Pino v7+ 使用 worker 线程处理日志传输
 * - 函数无法通过 Structured Clone Algorithm 序列化
 * - 因此需要创建一个模块文件，在 worker 线程内部配置函数
 *
 * 注意：这个文件使用 CommonJS 格式，因为 worker 线程使用 require 加载
 */

const build = require('pino-pretty');

/**
 * 截断长字符串的辅助函数
 */
function truncate(str, maxLength) {
	if (!str || typeof str !== 'string') return String(str);
	if (str.length <= maxLength) return str;
	return `${str.substring(0, maxLength - 3)}...`;
}

/**
 * 导出配置好的 pino-pretty 实例
 * 这个函数会在 worker 线程中执行
 */
module.exports = (opts) => {
	return build({
		...opts,
		// ✅ 现在可以使用 customPrettifiers 了！
		customPrettifiers: {
			// 截断所有 URL 字段（> 80 字符）- 控制台显示用
			imageUrl: (url) => truncate(String(url), 80),
			url: (url) => truncate(String(url), 80),
			modelUrl: (url) => truncate(String(url), 80),
			mtlUrl: (url) => truncate(String(url), 80),
			textureUrl: (url) => truncate(String(url), 80),
			previewImageUrl: (url) => truncate(String(url), 80),
			temporaryImageUrl: (url) => truncate(String(url), 80),
			s3ImageUrl: (url) => truncate(String(url), 80),
			s3ModelUrl: (url) => truncate(String(url), 80),
			s3MtlUrl: (url) => truncate(String(url), 80),
			s3TextureUrl: (url) => truncate(String(url), 80),

			// 截断超长提示词（> 60 字符）- 控制台显示用
			prompt: (text) => truncate(String(text), 60),
			imagePrompt: (text) => truncate(String(text), 60),
			optimizedPrompt: (text) => truncate(String(text), 60),

			// 截断错误消息（> 120 字符）- 控制台显示用
			err: (err) => {
				if (err && err.message) {
					return truncate(String(err.message), 120);
				}
				return truncate(String(err), 120);
			},

			// 截断一般消息（> 100 字符）- 控制台显示用
			message: (msg) => truncate(String(msg), 100),

			// 简化对象显示 - 控制台只显示关键信息
			generationJob: (obj) => {
				if (obj && typeof obj === 'object') {
					if (obj.status && obj.id) {
						return `Job:${obj.id.substring(0, 8)}..[${obj.status}]`;
					} else if (obj.status) {
						return `Job[${obj.status}]`;
					}
					return truncate(JSON.stringify(obj), 60);
				}
				return truncate(String(obj), 60);
			},

			// 简化数组显示（只显示长度）- 控制台显示用
			images: (arr) => {
				if (Array.isArray(arr)) {
					return `Images[${arr.length}]`;
				}
				return String(arr);
			},

			// 简化长文本字段
			stack: (stack) => truncate(String(stack), 150),
		},
	});
};
