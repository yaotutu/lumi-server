/**
 * 阿里云通义千问 LLM 适配器
 *
 * 文档: https://help.aliyun.com/zh/model-studio/qwen-api
 *
 * 特性:
 * - 使用 OpenAI 兼容模式
 * - 支持多种 Qwen 模型 (qwen-max, qwen-plus, qwen-turbo)
 * - 支持 JSON 模式响应
 */

import { config } from '@/config/index';
import { BaseLLMProvider } from '../base';
import type { LLMConfig } from '../types';

/**
 * 阿里云通义千问 LLM 适配器
 */
export class QwenLLMAdapter extends BaseLLMProvider {
	getName(): string {
		return 'QwenLLMProvider';
	}

	protected getConfig(): LLMConfig {
		const apiKey = config.providers.qwen.apiKey || '';
		const baseURL =
			config.providers.qwen.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
		const model = config.providers.qwen.model || 'qwen-max'; // 默认使用 qwen-max

		return {
			apiKey,
			baseURL,
			model,
		};
	}
}
