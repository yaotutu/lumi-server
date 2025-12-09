/**
 * 图片生成服务 - 工厂函数
 *
 * 职责：根据环境变量自动选择合适的图片生成 Provider
 *
 * 优先级：
 * 1. SiliconFlow（SILICONFLOW_API_KEY）
 * 2. 阿里云（ALIYUN_IMAGE_API_KEY）
 */

import { config } from '@/config/index';
import { logger } from '@/utils/logger';
import { AliyunImageAdapter } from './adapters/aliyun';
import { SiliconFlowImageAdapter } from './adapters/siliconflow';
import type { ImageGenerationProvider, ImageProviderType } from './types';

/**
 * 获取当前应该使用的 Provider 类型
 */
export function getImageProviderType(): ImageProviderType {
	// 1. 检查 SiliconFlow
	if (config.providers.siliconflow.apiKey) {
		logger.info({ msg: '使用 SiliconFlow Provider' });
		return 'siliconflow';
	}

	// 2. 检查阿里云
	if (config.providers.aliyun.image.apiKey) {
		logger.info({ msg: '使用阿里云 Provider' });
		return 'aliyun';
	}

	// 3. 未配置任何渠道
	throw new Error('未配置图片生成渠道，请设置 SILICONFLOW_API_KEY 或 ALIYUN_IMAGE_API_KEY');
}

/**
 * 创建图片生成 Provider 实例
 *
 * @returns ImageGenerationProvider 实例
 */
export function createImageProvider(): ImageGenerationProvider {
	const providerType = getImageProviderType();

	switch (providerType) {
		case 'siliconflow':
			return new SiliconFlowImageAdapter();

		case 'aliyun':
			return new AliyunImageAdapter();

		default:
			throw new Error(`不支持的 Provider 类型: ${providerType}`);
	}
}
