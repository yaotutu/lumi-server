/**
 * 提示词优化服务
 * 职责:将用户输入优化为适合3D打印的图片生成提示词
 * 原则:函数式编程,带降级策略,确保业务连续性
 */

import { IMAGE_3D_PRINT_MULTI_VARIANT_PROMPT, IMAGE_3D_PRINT_PROMPT } from '@/prompts';
import { createLLMProvider } from '@/providers';
import { logger } from '@/utils/logger';

/**
 * 优化用户输入的提示词,使其适合3D打印场景
 * @param userInput - 用户原始输入
 * @returns 优化后的提示词(失败时返回原始输入)
 */
export async function optimizePromptFor3DPrint(userInput: string): Promise<string> {
	try {
		logger.info({
			msg: '开始优化提示词',
			userInput,
			inputLength: userInput.length,
		});

		const llmProvider = createLLMProvider();
		const optimized = await llmProvider.chatCompletion({
			systemPrompt: IMAGE_3D_PRINT_PROMPT,
			userPrompt: userInput,
			temperature: 0.7,
			responseFormat: 'text',
		});

		const trimmedOptimized = optimized.trim();
		logger.info({
			msg: '✅ 提示词优化成功',
			original: userInput,
			optimized: trimmedOptimized,
		});

		return trimmedOptimized;
	} catch (error) {
		logger.warn({
			msg: '⚠️ 提示词优化失败,降级使用原始输入',
			error: error instanceof Error ? error.message : String(error),
			userInput,
		});
		return userInput;
	}
}

/**
 * 生成4个不同风格的3D打印提示词
 * @param userInput - 用户原始输入
 * @returns 4个不同风格的提示词数组（失败时返回4个相同的原始输入）
 */
export async function generateMultiStylePrompts(userInput: string): Promise<string[]> {
	try {
		logger.info({
			msg: '开始生成多风格提示词',
			userInput,
			inputLength: userInput.length,
		});

		const llmProvider = createLLMProvider();
		const variants = await llmProvider.generatePromptVariants(
			userInput,
			IMAGE_3D_PRINT_MULTI_VARIANT_PROMPT,
		);

		logger.info({
			msg: '✅ 多风格提示词生成成功',
			original: userInput,
			variantCount: variants.length,
		});

		return variants;
	} catch (error) {
		logger.warn({
			msg: '⚠️ 生成多风格提示词失败，降级使用原始输入',
			error: error instanceof Error ? error.message : String(error),
			userInput,
		});
		return [userInput, userInput, userInput, userInput];
	}
}
