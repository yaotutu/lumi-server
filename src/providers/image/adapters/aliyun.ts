/**
 * 阿里云图片生成适配器
 *
 * 文档: https://help.aliyun.com/zh/model-studio/qwen-image-api
 *
 * ⚠️ 重要说明：
 * - 阿里云返回的图片URL为临时链接，有效期仅 24小时
 * - 当前实现直接使用临时URL，未下载到本地存储
 * - TODO: 对接OSS后，需要下载图片并保存到永久存储
 */

import { config } from '@/config/index';
import { logger } from '@/utils/logger';
import { BaseImageProvider } from '../base';
import type { ImageGenerationConfig } from '../types';

/**
 * 阿里云异步 API 请求类型
 * 注意: 异步调用使用简化的 input.prompt 字符串格式
 */
interface QwenAsyncImageRequest {
	model: string;
	input: {
		prompt: string; // 直接使用字符串，而不是 messages 数组
	};
	parameters?: {
		size?: string; // 图片尺寸
		prompt_extend?: boolean; // 是否启用智能改写
		watermark?: boolean; // 是否添加水印
		negative_prompt?: string; // 负向提示词
	};
}

/**
 * 阿里云异步任务创建响应
 */
interface QwenAsyncTaskCreateResponse {
	output: {
		task_id: string; // 任务ID
		task_status: string; // 任务状态: PENDING, RUNNING, SUCCEEDED, FAILED
	};
	request_id: string;
}

/**
 * 阿里云异步任务查询响应
 */
interface QwenAsyncTaskQueryResponse {
	output: {
		task_id: string; // 任务ID
		task_status: string; // 任务状态: PENDING, RUNNING, SUCCEEDED, FAILED
		results?: Array<{
			url: string; // 图片URL（24小时有效期）
		}>;
		task_metrics?: {
			TOTAL: number;
			SUCCEEDED: number;
			FAILED: number;
		};
		code?: string; // 错误码
		message?: string; // 错误信息
	};
	request_id: string;
}

/**
 * 阿里云图片生成适配器
 */
export class AliyunImageAdapter extends BaseImageProvider {
	getName(): string {
		return 'AliyunImageProvider';
	}

	protected getConfig(): ImageGenerationConfig {
		const apiKey = config.providers.aliyun.image.apiKey || '';
		const endpoint =
			config.providers.aliyun.image.endpoint ||
			'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
		const model = config.providers.aliyun.image.model || 'qwen-image-plus'; // 从配置读取，默认使用 qwen-image-plus

		return {
			apiKey,
			endpoint,
			model,
		};
	}

	/**
	 * 创建异步图片生成任务
	 * @param prompt 提示词
	 * @returns 任务ID
	 */
	private async createAsyncTask(prompt: string): Promise<string> {
		const providerConfig = this.getConfig();

		// 使用异步API的请求格式（input.prompt 是字符串）
		const requestBody: QwenAsyncImageRequest = {
			model: providerConfig.model as string,
			input: {
				prompt: prompt, // 直接使用字符串
			},
			parameters: {
				size: '1328*1328', // 支持的尺寸: 1664*928, 1472*1140, 1328*1328, 1140*1472, 928*1664
				prompt_extend: true, // 启用智能改写,提升生成效果
				watermark: false, // 不添加水印
				negative_prompt: '', // 负向提示词
			},
		};

		logger.info({
			msg: '📤 [AliyunImageProvider] 创建异步任务',
			url: providerConfig.endpoint,
			method: 'POST',
			model: providerConfig.model,
			prompt: prompt.substring(0, 100),
		});

		// 发送异步任务创建请求
		const response = await fetch(providerConfig.endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${providerConfig.apiKey}`,
				'X-DashScope-Async': 'enable', // 关键：启用异步模式
			},
			body: JSON.stringify(requestBody),
		});

		// 解析响应
		const responseText = await response.text();
		let data: QwenAsyncTaskCreateResponse;

		try {
			data = JSON.parse(responseText) as QwenAsyncTaskCreateResponse;
		} catch (parseError) {
			logger.error({
				msg: '❌ [AliyunImageProvider] 创建任务响应解析失败',
				responseText,
				parseError: parseError instanceof Error ? parseError.message : String(parseError),
			});
			throw new Error(`Failed to parse task create response: ${responseText}`);
		}

		// 检查HTTP状态码
		if (!response.ok) {
			logger.error({
				msg: '❌ [AliyunImageProvider] 创建任务失败',
				httpStatusCode: response.status,
				httpStatusText: response.statusText,
				responseBody: data,
			});
			const errorMsg = `阿里云API错误: ${response.status} - ${(data as unknown as { message?: string }).message || response.statusText}`;
			throw new Error(errorMsg);
		}

		// 检查响应结构
		if (!data?.output?.task_id) {
			logger.error({
				msg: '❌ [AliyunImageProvider] 任务创建响应格式错误',
				responseBody: data,
			});
			throw new Error(`任务创建响应格式错误: ${JSON.stringify(data)}`);
		}

		logger.info({
			msg: '✅ [AliyunImageProvider] 异步任务创建成功',
			taskId: data.output.task_id,
			taskStatus: data.output.task_status,
			requestId: data.request_id,
		});

		return data.output.task_id;
	}

	/**
	 * 查询异步任务状态
	 * @param taskId 任务ID
	 * @returns 任务查询响应
	 */
	private async queryTaskStatus(taskId: string): Promise<QwenAsyncTaskQueryResponse> {
		const providerConfig = this.getConfig();
		// 任务查询端点
		const queryEndpoint = 'https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}';
		const url = queryEndpoint.replace('{task_id}', taskId);

		const response = await fetch(url, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${providerConfig.apiKey}`,
			},
		});

		const responseText = await response.text();
		let data: QwenAsyncTaskQueryResponse;

		try {
			data = JSON.parse(responseText) as QwenAsyncTaskQueryResponse;
		} catch (parseError) {
			logger.error({
				msg: '❌ [AliyunImageProvider] 任务状态查询响应解析失败',
				taskId,
				responseText,
				parseError: parseError instanceof Error ? parseError.message : String(parseError),
			});
			throw new Error(`Failed to parse task query response: ${responseText}`);
		}

		if (!response.ok) {
			logger.error({
				msg: '❌ [AliyunImageProvider] 任务状态查询失败',
				taskId,
				httpStatusCode: response.status,
				httpStatusText: response.statusText,
				responseBody: data,
			});
			throw new Error(`任务查询失败: ${response.status} - ${response.statusText}`);
		}

		return data;
	}

	/**
	 * 等待异步任务完成
	 * @param taskId 任务ID
	 * @param maxWaitTime 最大等待时间（毫秒），默认60秒
	 * @param pollInterval 轮询间隔（毫秒），默认3秒
	 * @returns 图片URL
	 */
	private async waitForTaskCompletion(
		taskId: string,
		maxWaitTime = 60000,
		pollInterval = 3000,
	): Promise<string> {
		const startTime = Date.now();

		logger.info({
			msg: '⏳ [AliyunImageProvider] 开始轮询任务状态',
			taskId,
			maxWaitTime,
			pollInterval,
		});

		// 轮询查询任务状态
		while (true) {
			// 检查是否超时
			const elapsedTime = Date.now() - startTime;
			if (elapsedTime > maxWaitTime) {
				logger.error({
					msg: '❌ [AliyunImageProvider] 任务等待超时',
					taskId,
					elapsedTime,
					maxWaitTime,
				});
				throw new Error(`任务等待超时（超过 ${maxWaitTime}ms）`);
			}

			// 查询任务状态
			const queryResult = await this.queryTaskStatus(taskId);

			logger.info({
				msg: '🔍 [AliyunImageProvider] 任务状态查询',
				taskId,
				taskStatus: queryResult.output.task_status,
				elapsedTime,
			});

			// 任务成功完成
			if (queryResult.output.task_status === 'SUCCEEDED') {
				if (!queryResult.output.results || queryResult.output.results.length === 0) {
					logger.error({
						msg: '❌ [AliyunImageProvider] 任务完成但未返回图片',
						taskId,
						responseBody: queryResult,
					});
					throw new Error('任务完成但未返回图片');
				}

				const imageUrl = queryResult.output.results[0].url;
				logger.info({
					msg: '✅ [AliyunImageProvider] 任务完成，获取到图片',
					taskId,
					imageUrlPreview: `${imageUrl.substring(0, 80)}...`,
					elapsedTime,
				});

				return imageUrl;
			}

			// 任务失败
			if (queryResult.output.task_status === 'FAILED') {
				logger.error({
					msg: '❌ [AliyunImageProvider] 任务执行失败',
					taskId,
					code: queryResult.output.code,
					message: queryResult.output.message,
					elapsedTime,
				});
				throw new Error(`任务执行失败: ${queryResult.output.code} - ${queryResult.output.message}`);
			}

			// 任务仍在进行中（PENDING 或 RUNNING），等待后继续轮询
			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}
	}

	protected async generateImagesImpl(prompt: string, count: number): Promise<string[]> {
		const allImages: string[] = [];

		// 注意: 阿里云异步API一次只能生成1张图片，需要多次调用
		for (let i = 0; i < count; i++) {
			try {
				logger.info({
					msg: '🎨 [AliyunImageProvider] 开始生成图片（异步模式）',
					imageIndex: i + 1,
					totalCount: count,
					prompt: prompt.substring(0, 100),
				});

				// 步骤1: 创建异步任务
				const taskId = await this.createAsyncTask(prompt);

				// 步骤2: 等待任务完成并获取图片URL
				const imageUrl = await this.waitForTaskCompletion(taskId);

				// 步骤3: 收集图片URL
				allImages.push(imageUrl);

				logger.info({
					msg: '✅ [AliyunImageProvider] 图片生成成功',
					imageIndex: i + 1,
					totalCount: count,
					imageUrlPreview: `${imageUrl.substring(0, 80)}...`,
				});
			} catch (error) {
				logger.error({
					msg: '❌ [AliyunImageProvider] 生成图片失败',
					imageIndex: i + 1,
					totalCount: count,
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				});
				throw error;
			}
		}

		// 检查是否成功生成了所有图片
		if (allImages.length === 0) {
			throw new Error('未生成任何图片');
		}

		return allImages;
	}

	protected async *generateImageStreamImpl(
		prompt: string,
		count: number,
	): AsyncGenerator<string, void, unknown> {
		// 流式生成：每生成一张图片就立即返回
		for (let i = 0; i < count; i++) {
			logger.info({
				msg: '🎨 [AliyunImageProvider] 流式生成图片（异步模式）',
				imageIndex: i + 1,
				totalCount: count,
			});

			// 步骤1: 创建异步任务
			const taskId = await this.createAsyncTask(prompt);

			// 步骤2: 等待任务完成并获取图片URL
			const imageUrl = await this.waitForTaskCompletion(taskId);

			// 步骤3: 立即返回图片URL
			logger.info({
				msg: '✅ [AliyunImageProvider] 流式返回图片',
				imageIndex: i + 1,
				totalCount: count,
			});

			// ⚠️ 返回值可能是以下格式之一：
			// 1. HTTP URL: https://dashscope-result.oss-cn-beijing.aliyuncs.com/xxx.png
			// 注意: URL有效期仅24小时
			yield imageUrl;
		}
	}
}
