/**
 * LLM Provider 抽象基类
 *
 * 职责：
 * - 定义统一的接口和公共逻辑
 * - 提供日志记录
 * - 使用 OpenAI SDK 实现通用逻辑
 */

import OpenAI from 'openai';
import { logger } from '@/utils/logger';
import type { ChatCompletionRequest, LLMConfig, LLMProvider } from './types';

/**
 * LLM Provider 抽象基类
 *
 * 子类需要实现：
 * - getConfig(): 返回渠道配置
 * - getName(): 返回渠道名称
 */
export abstract class BaseLLMProvider implements LLMProvider {
	/**
	 * 获取配置（子类实现）
	 */
	protected abstract getConfig(): LLMConfig;

	/**
	 * 获取 Provider 名称（子类实现）
	 */
	abstract getName(): string;

	/**
	 * 验证配置
	 */
	protected validateConfig(): void {
		const config = this.getConfig();

		if (!config.apiKey) {
			throw new Error(`${this.getName()}: API Key 未配置`);
		}

		if (!config.baseURL) {
			throw new Error(`${this.getName()}: Base URL 未配置`);
		}

		if (!config.model) {
			throw new Error(`${this.getName()}: Model 未配置`);
		}
	}

	/**
	 * 创建 OpenAI 客户端实例
	 */
	protected createClient(): OpenAI {
		const config = this.getConfig();

		logger.info({
			msg: '创建 LLM 客户端',
			provider: this.getName(),
			baseURL: config.baseURL,
			model: config.model,
		});

		return new OpenAI({
			apiKey: config.apiKey,
			baseURL: config.baseURL,
		});
	}

	/**
	 * 聊天补全 - 公共实现
	 */
	async chatCompletion(request: ChatCompletionRequest): Promise<string> {
		// 验证配置
		this.validateConfig();

		const config = this.getConfig();
		const client = this.createClient();

		logger.info({
			msg: '开始调用 LLM',
			provider: this.getName(),
			model: config.model,
			userPromptLength: request.userPrompt.length,
			temperature: request.temperature ?? 0.7,
			responseFormat: request.responseFormat ?? 'text',
		});

		try {
			const response = await client.chat.completions.create({
				model: config.model,
				messages: [
					{
						role: 'system',
						content: request.systemPrompt,
					},
					{
						role: 'user',
						content: request.userPrompt,
					},
				],
				temperature: request.temperature ?? 0.7,
				...(request.responseFormat === 'json' && {
					response_format: { type: 'json_object' },
				}),
			});

			const content = response.choices[0]?.message?.content || '';

			if (!content) {
				throw new Error('LLM 返回空内容');
			}

			logger.info({
				msg: 'LLM 调用成功',
				provider: this.getName(),
				model: config.model,
				responseLength: content.length,
				usage: response.usage,
			});

			return content;
		} catch (error) {
			logger.error({
				msg: 'LLM 调用失败',
				provider: this.getName(),
				model: config.model,
				error,
			});
			throw error;
		}
	}

	/**
	 * 生成提示词变体 - 公共实现
	 */
	async generatePromptVariants(userPrompt: string, systemPrompt: string): Promise<string[]> {
		try {
			const response = await this.chatCompletion({
				systemPrompt,
				userPrompt,
				temperature: 0.7,
				responseFormat: 'json',
			});

			// 解析 JSON 响应
			const parsed = JSON.parse(response);

			// 验证响应格式
			if (!parsed.variants || !Array.isArray(parsed.variants) || parsed.variants.length !== 4) {
				logger.warn({
					msg: '响应格式不符合预期',
					provider: this.getName(),
					response: parsed,
				});
				throw new Error('提示词变体数量不正确');
			}

			logger.info({
				msg: '提示词变体生成成功',
				provider: this.getName(),
				variantCount: parsed.variants.length,
			});

			return parsed.variants as string[];
		} catch (error) {
			logger.error({
				msg: '提示词变体生成失败',
				provider: this.getName(),
				error,
			});

			// 优雅降级：返回原始提示词的4份副本
			logger.warn({
				msg: '降级处理：使用原始提示词',
				provider: this.getName(),
			});
			return [userPrompt, userPrompt, userPrompt, userPrompt];
		}
	}
}
