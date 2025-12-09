/**
 * 图片生成服务 - 类型定义
 *
 * 职责：定义图片生成服务的统一接口和类型
 */

/**
 * 图片生成配置
 */
export interface ImageGenerationConfig {
	apiKey: string; // API 密钥
	endpoint: string; // API 端点
	model?: string; // 模型名称（可选）
}

/**
 * 图片生成参数
 */
export interface ImageGenerationParams {
	prompt: string; // 生成提示词
	count: number; // 生成数量
	size?: string; // 图片尺寸（可选）
	negativePrompt?: string; // 负向提示词（可选）
}

/**
 * 图片生成 Provider 统一接口
 *
 * 所有图片生成渠道必须实现此接口
 */
export interface ImageGenerationProvider {
	/**
	 * 批量生成图片
	 *
	 * @param prompt 生成提示词
	 * @param count 生成数量
	 * @returns 图片 URL 数组
	 */
	generateImages(prompt: string, count: number): Promise<string[]>;

	/**
	 * 流式生成图片（逐张返回）
	 *
	 * @param prompt 生成提示词
	 * @param count 生成数量
	 * @yields 图片 URL
	 */
	generateImageStream(prompt: string, count: number): AsyncGenerator<string, void, unknown>;

	/**
	 * 获取 Provider 名称
	 */
	getName(): string;
}

/**
 * 图片生成渠道枚举
 */
export type ImageProviderType = 'aliyun' | 'siliconflow';
