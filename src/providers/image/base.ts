/**
 * 图片生成服务 - 抽象基类
 *
 * 职责：提供所有图片生成 Provider 的公共逻辑
 * - 错误处理
 * - 日志记录
 * - 配置验证
 */

import { logger } from '@/utils/logger';
import type { ImageGenerationConfig, ImageGenerationProvider } from './types';

/**
 * 图片生成 Provider 抽象基类
 */
export abstract class BaseImageProvider implements ImageGenerationProvider {
	/**
	 * 获取 Provider 配置
	 * 子类必须实现此方法
	 */
	protected abstract getConfig(): ImageGenerationConfig;

	/**
	 * 获取 Provider 名称
	 * 子类必须实现此方法
	 */
	abstract getName(): string;

	/**
	 * 实际的图片生成逻辑
	 * 子类必须实现此方法
	 */
	protected abstract generateImagesImpl(prompt: string, count: number): Promise<string[]>;

	/**
	 * 实际的流式图片生成逻辑
	 * 子类必须实现此方法
	 */
	protected abstract generateImageStreamImpl(
		prompt: string,
		count: number,
	): AsyncGenerator<string, void, unknown>;

	/**
	 * 验证配置是否有效
	 */
	protected validateConfig(): void {
		const config = this.getConfig();

		if (!config.apiKey) {
			throw new Error(`${this.getName()}: API Key 未配置`);
		}

		if (!config.endpoint) {
			throw new Error(`${this.getName()}: API Endpoint 未配置`);
		}
	}

	/**
	 * 批量生成图片（公共接口）
	 */
	async generateImages(prompt: string, count: number): Promise<string[]> {
		// 验证配置
		this.validateConfig();

		// 调用子类实现
		logger.info({
			msg: '开始生成图片',
			provider: this.getName(),
			promptLength: prompt.length,
			count,
		});

		try {
			const images = await this.generateImagesImpl(prompt, count);

			logger.info({
				msg: '图片生成完成',
				provider: this.getName(),
				count: images.length,
			});

			return images;
		} catch (error) {
			logger.error({
				msg: '图片生成失败',
				provider: this.getName(),
				error,
			});
			throw error;
		}
	}

	/**
	 * 流式生成图片（公共接口）
	 */
	async *generateImageStream(prompt: string, count: number): AsyncGenerator<string, void, unknown> {
		// 验证配置
		this.validateConfig();

		// 调用子类实现
		logger.info({
			msg: '开始流式生成图片',
			provider: this.getName(),
			promptLength: prompt.length,
			count,
		});

		try {
			yield* this.generateImageStreamImpl(prompt, count);

			logger.info({
				msg: '流式生成完成',
				provider: this.getName(),
			});
		} catch (error) {
			logger.error({
				msg: '流式生成失败',
				provider: this.getName(),
				error,
			});
			throw error;
		}
	}

	/**
	 * 延迟工具函数
	 */
	protected delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
