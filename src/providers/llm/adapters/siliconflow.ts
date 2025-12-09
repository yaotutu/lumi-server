/**
 * SiliconFlow LLM 适配器
 *
 * 文档: https://docs.siliconflow.cn/api-reference/chat-completions/create
 *
 * 特性:
 * - 使用 OpenAI 兼容模式
 * - 支持 DeepSeek-V3 等开源模型
 * - 性价比高，适合大规模使用
 */

import { config } from '@/config/index';
import { BaseLLMProvider } from '../base';
import type { LLMConfig } from '../types';

/**
 * SiliconFlow LLM 适配器
 */
export class SiliconFlowLLMAdapter extends BaseLLMProvider {
	getName(): string {
		return 'SiliconFlowLLMProvider';
	}

	protected getConfig(): LLMConfig {
		const apiKey = config.providers.siliconflow.apiKey || '';
		const baseURL = config.providers.siliconflow.llm.baseUrl || 'https://api.siliconflow.cn/v1';
		const model = config.providers.siliconflow.llm.model || 'deepseek-ai/DeepSeek-V3'; // 默认使用 DeepSeek-V3

		return {
			apiKey,
			baseURL,
			model,
		};
	}
}
