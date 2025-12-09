/**
 * LLM Provider 类型定义
 *
 * 统一的大语言模型服务接口
 */

/**
 * LLM Provider 类型
 */
export type LLMProviderType = 'qwen' | 'siliconflow';

/**
 * LLM 配置
 */
export interface LLMConfig {
	apiKey: string; // API密钥
	baseURL: string; // API基础URL
	model: string; // 模型名称
}

/**
 * 聊天补全请求参数
 */
export interface ChatCompletionRequest {
	systemPrompt: string; // 系统提示词
	userPrompt: string; // 用户提示词
	temperature?: number; // 温度参数，默认0.7
	responseFormat?: 'text' | 'json'; // 响应格式，默认text
}

/**
 * LLM Provider 统一接口
 *
 * 所有 LLM 适配器必须实现此接口
 */
export interface LLMProvider {
	/**
	 * 聊天补全 - 调用LLM生成响应
	 * @param request 聊天补全请求参数
	 * @returns LLM响应内容
	 */
	chatCompletion(request: ChatCompletionRequest): Promise<string>;

	/**
	 * 生成提示词变体 - 用于图片生成的提示词优化
	 * @param userPrompt 用户原始提示词
	 * @param systemPrompt 系统提示词（定义生成规则）
	 * @returns 提示词变体数组（4个）
	 */
	generatePromptVariants(userPrompt: string, systemPrompt: string): Promise<string[]>;

	/**
	 * 获取 Provider 名称
	 */
	getName(): string;
}
