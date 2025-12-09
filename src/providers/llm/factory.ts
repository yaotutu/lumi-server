/**
 * LLM Provider 工厂函数
 *
 * 职责：根据环境变量自动选择合适的 LLM Provider
 *
 * 优先级：
 * 1. SiliconFlow（SILICONFLOW_API_KEY）
 * 2. 阿里云通义千问（QWEN_API_KEY）
 */

import { config } from '@/config/index';
import { logger } from '@/utils/logger';
import { QwenLLMAdapter } from './adapters/qwen';
import { SiliconFlowLLMAdapter } from './adapters/siliconflow';
import type { LLMProvider, LLMProviderType } from './types';

/**
 * 获取当前应该使用的 LLM Provider 类型
 */
export function getLLMProviderType(): LLMProviderType {
	// 1. 检查 SiliconFlow
	if (config.providers.siliconflow.apiKey) {
		logger.info({ msg: '使用 SiliconFlow (DeepSeek-V3) Provider' });
		return 'siliconflow';
	}

	// 2. 检查阿里云通义千问
	if (config.providers.qwen.apiKey) {
		logger.info({ msg: '使用阿里云通义千问 (Qwen) Provider' });
		return 'qwen';
	}

	// 3. 未配置任何渠道
	throw new Error('未配置 LLM 渠道，请设置 SILICONFLOW_API_KEY 或 QWEN_API_KEY');
}

/**
 * 创建 LLM Provider 实例
 *
 * @returns LLMProvider 实例
 */
export function createLLMProvider(): LLMProvider {
	const providerType = getLLMProviderType();

	switch (providerType) {
		case 'siliconflow':
			return new SiliconFlowLLMAdapter();

		case 'qwen':
			return new QwenLLMAdapter();

		default:
			throw new Error(`不支持的 LLM Provider 类型: ${providerType}`);
	}
}
