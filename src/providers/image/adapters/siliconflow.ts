/**
 * SiliconFlow 图片生成适配器
 *
 * 文档: https://docs.siliconflow.cn/api-reference/images/generations
 *
 * 特性:
 * - 支持多种开源图像生成模型
 * - 返回永久URL（无24小时限制）
 * - 性价比高，适合大规模生成
 */

import { config } from '@/config/index';
import { logger } from '@/utils/logger';
import { BaseImageProvider } from '../base';
import type { ImageGenerationConfig } from '../types';

/**
 * SiliconFlow API 请求类型
 */
interface SiliconFlowImageRequest {
	model: string; // 模型名称
	prompt: string; // 生成提示词
	image_size?: string; // 图片尺寸
	batch_size?: number; // 批次大小
	num_inference_steps?: number; // 推理步数
	guidance_scale?: number; // 引导系数
	negative_prompt?: string; // 负向提示词
	seed?: number; // 随机种子
}

/**
 * SiliconFlow API 响应类型
 */
interface SiliconFlowImageResponse {
	images: Array<{
		url: string; // 图片URL
	}>;
	timings: {
		inference: number; // 推理时长（毫秒）
	};
	seed: number; // 使用的随机种子
}

/**
 * SiliconFlow 图片生成适配器
 */
export class SiliconFlowImageAdapter extends BaseImageProvider {
	getName(): string {
		return 'SiliconFlowImageProvider';
	}

	protected getConfig(): ImageGenerationConfig {
		const apiKey = config.providers.siliconflow.apiKey || '';
		const endpoint =
			config.providers.siliconflow.image.endpoint ||
			'https://api.siliconflow.cn/v1/images/generations';
		const model = config.providers.siliconflow.image.model || 'Qwen/Qwen-Image'; // 通义万相文生图模型

		return {
			apiKey,
			endpoint,
			model,
		};
	}

	protected async generateImagesImpl(prompt: string, count: number): Promise<string[]> {
		const providerConfig = this.getConfig();
		const allImages: string[] = [];

		// 逐张生成（与阿里云保持一致）
		for (let i = 0; i < count; i++) {
			const requestBody: SiliconFlowImageRequest = {
				model: providerConfig.model as string,
				prompt: prompt,
				image_size: '1024x1024',
				batch_size: 1,
				num_inference_steps: 20,
				guidance_scale: 7.5,
				negative_prompt: '',
			};

			try {
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

					// 记录详细错误
					logger.error({
						msg: 'API 调用失败',
						status: response.status,
						statusText: response.statusText,
						errorData: JSON.stringify(errorData),
						requestBody: JSON.stringify(requestBody),
					});

					const errorMsg = `SiliconFlow API错误: ${response.status} - ${(errorData as { error?: { message?: string }; message?: string }).error?.message || (errorData as { message?: string }).message || response.statusText}`;
					throw new Error(errorMsg);
				}

				const data = (await response.json()) as SiliconFlowImageResponse;

				// 验证响应格式
				if (!data || !data.images || data.images.length === 0) {
					throw new Error(`API响应格式错误: ${JSON.stringify(data)}`);
				}

				const imageUrl = data.images[0].url;
				if (imageUrl) {
					allImages.push(imageUrl);

					logger.info({
						msg: '图片生成成功',
						imageIndex: i + 1,
						totalCount: count,
						inferenceTime: data.timings.inference,
						seed: data.seed,
					});
				} else {
					throw new Error('响应中未找到图片URL');
				}
			} catch (error) {
				logger.error({
					msg: '生成图片失败',
					imageIndex: i + 1,
					totalCount: count,
					error,
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

		logger.info({
			msg: '开始流式生成图片',
			count,
			model: providerConfig.model,
			promptLength: prompt.length,
		});

		for (let i = 0; i < count; i++) {
			const requestBody: SiliconFlowImageRequest = {
				model: providerConfig.model as string,
				prompt: prompt,
				image_size: '1024x1024',
				batch_size: 1,
				num_inference_steps: 20,
				guidance_scale: 7.5,
				negative_prompt: '',
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

				// 记录详细错误
				logger.error({
					msg: 'API 调用失败',
					status: response.status,
					statusText: response.statusText,
					errorData: JSON.stringify(errorData),
					requestBody: JSON.stringify(requestBody),
				});

				const errorMsg = `SiliconFlow API错误: ${response.status} - ${(errorData as { error?: { message?: string }; message?: string }).error?.message || (errorData as { message?: string }).message || response.statusText}`;
				throw new Error(errorMsg);
			}

			const data = (await response.json()) as SiliconFlowImageResponse;

			logger.info({
				msg: '图片生成成功',
				imageIndex: i + 1,
				totalCount: count,
				inferenceTime: data.timings.inference,
				seed: data.seed,
			});

			if (!data || !data.images || data.images.length === 0) {
				throw new Error(`API响应格式错误: ${JSON.stringify(data)}`);
			}

			const imageUrl = data.images[0].url;
			if (imageUrl) {
				// SiliconFlow 返回永久URL，无24小时限制
				yield imageUrl;
			} else {
				throw new Error('响应中未找到图片URL');
			}
		}
	}
}
