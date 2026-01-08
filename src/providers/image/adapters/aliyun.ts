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
 * 阿里云 API 请求类型
 */
interface QwenImageRequest {
	model: string;
	input: {
		messages: Array<{
			role: string;
			content: Array<{
				text: string;
			}>;
		}>;
	};
	parameters?: {
		size?: string; // 图片尺寸
		prompt_extend?: boolean; // 是否启用智能改写
		watermark?: boolean; // 是否添加水印
		negative_prompt?: string; // 负向提示词
	};
}

/**
 * 阿里云 API 响应类型
 */
interface QwenImageResponse {
	output: {
		choices: Array<{
			finish_reason: string;
			message: {
				role: string;
				content: Array<{
					image: string;
				}>;
			};
		}>;
		task_metric?: {
			TOTAL: number;
			FAILED: number;
			SUCCEEDED: number;
		};
	};
	usage: {
		width: number;
		height: number;
		image_count: number;
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
			'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
		const model = 'qwen-image-plus'; // 使用 qwen-image-plus（性价比更高）

		return {
			apiKey,
			endpoint,
			model,
		};
	}

	protected async generateImagesImpl(prompt: string, count: number): Promise<string[]> {
		const providerConfig = this.getConfig();
		const allImages: string[] = [];

		// 注意: API一次只能生成1张图片，需要多次调用
		for (let i = 0; i < count; i++) {
			const requestBody: QwenImageRequest = {
				model: providerConfig.model as string,
				input: {
					messages: [
						{
							role: 'user',
							content: [
								{
									text: prompt,
								},
							],
						},
					],
				},
				parameters: {
					size: '1328*1328', // 支持的尺寸: 1664*928, 1472*1140, 1328*1328, 1140*1472, 928*1664
					prompt_extend: true, // 启用智能改写,提升生成效果
					watermark: false, // 不添加水印
					negative_prompt: '', // 负向提示词
				},
			};

			try {
				// 打印完整的请求报文（脱敏处理）
				logger.info({
					msg: '📤 [AliyunImageProvider] 发送请求',
					url: providerConfig.endpoint,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${providerConfig.apiKey.substring(0, 20)}...***`,
					},
					body: requestBody,
					imageIndex: i + 1,
					totalCount: count,
				});

				const response = await fetch(providerConfig.endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${providerConfig.apiKey}`,
					},
					body: JSON.stringify(requestBody),
				});

				// 解析响应体
				const responseText = await response.text();
				let data: QwenImageResponse;

				try {
					data = JSON.parse(responseText) as QwenImageResponse;
				} catch (parseError) {
					logger.error({
						msg: '❌ [AliyunImageProvider] 响应 JSON 解析失败',
						url: providerConfig.endpoint,
						statusCode: response.status,
						statusText: response.statusText,
						responseText,
						parseError: parseError instanceof Error ? parseError.message : String(parseError),
					});
					throw new Error(`Failed to parse JSON response: ${responseText}`);
				}

				// 检查 HTTP 状态码
				if (!response.ok) {
					logger.error({
						msg: '❌ [AliyunImageProvider] HTTP 错误响应',
						url: providerConfig.endpoint,
						httpStatusCode: response.status,
						httpStatusText: response.statusText,
						responseHeaders: Object.fromEntries(response.headers.entries()),
						responseBody: data,
						imageIndex: i + 1,
						totalCount: count,
					});

					const errorMsg = `阿里云API错误: ${response.status} - ${(data as unknown as { message?: string }).message || response.statusText}`;
					throw new Error(errorMsg);
				}

				// 打印完整的响应报文
				logger.info({
					msg: '📥 [AliyunImageProvider] 收到响应',
					url: providerConfig.endpoint,
					httpStatusCode: response.status,
					httpStatusText: response.statusText,
					responseHeaders: Object.fromEntries(response.headers.entries()),
					responseBody: data,
					imageIndex: i + 1,
					totalCount: count,
				});

				// 检查响应数据结构
				if (!data || !data.output || !data.output.choices) {
					logger.error({
						msg: '❌ [AliyunImageProvider] API 响应格式错误',
						responseBody: data,
					});
					throw new Error(`API响应格式错误: ${JSON.stringify(data)}`);
				}

				// 提取图片URL
				const choice = data.output.choices[0];
				if (choice?.message?.content) {
					const imageContent = choice.message.content.find((c) => c.image);
					if (imageContent?.image) {
						allImages.push(imageContent.image);
						logger.info({
							msg: '✅ [AliyunImageProvider] 图片生成成功',
							imageIndex: i + 1,
							totalCount: count,
							imageUrlPreview: `${imageContent.image.substring(0, 80)}...`,
						});
					} else {
						throw new Error('响应中未找到图片URL');
					}
				} else {
					throw new Error('响应格式不正确');
				}
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

		if (allImages.length === 0) {
			throw new Error('未生成任何图片');
		}

		return allImages;
	}

	protected async *generateImageStreamImpl(
		prompt: string,
		count: number,
	): AsyncGenerator<string, void, unknown> {
		const providerConfig = this.getConfig();

		for (let i = 0; i < count; i++) {
			const requestBody: QwenImageRequest = {
				model: providerConfig.model as string,
				input: {
					messages: [
						{
							role: 'user',
							content: [
								{
									text: prompt,
								},
							],
						},
					],
				},
				parameters: {
					size: '1328*1328',
					prompt_extend: true,
					watermark: false,
					negative_prompt: '',
				},
			};

			const response = await fetch(providerConfig.endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${providerConfig.apiKey}`,
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));

				const errorMsg = `阿里云API错误: ${response.status} - ${(errorData as { message?: string }).message || response.statusText}`;
				logger.error({
					msg: '阿里云 API 调用失败',
					status: response.status,
					errorData,
				});
				throw new Error(errorMsg);
			}

			const data = (await response.json()) as QwenImageResponse;

			logger.info({
				msg: '图片生成成功',
				imageIndex: i + 1,
				totalCount: count,
			});

			if (!data || !data.output || !data.output.choices) {
				throw new Error(`API响应格式错误: ${JSON.stringify(data)}`);
			}

			const choice = data.output.choices[0];
			if (choice?.message?.content) {
				const imageContent = choice.message.content.find((c) => c.image);
				if (imageContent?.image) {
					// ⚠️ 返回值可能是以下格式之一：
					// 1. HTTP URL: https://dashscope-result.oss-cn-beijing.aliyuncs.com/xxx.png
					// 2. Base64: data:image/png;base64,iVBORw0KG...
					// 注意: URL有效期仅24小时
					yield imageContent.image;
				} else {
					throw new Error('响应中未找到图片URL');
				}
			} else {
				throw new Error('响应格式不正确');
			}
		}
	}
}
