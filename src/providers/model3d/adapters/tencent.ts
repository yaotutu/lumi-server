/**
 * 腾讯云混元 3D 适配器
 *
 * 文档: https://cloud.tencent.com/document/product/ai3d
 *
 * 特性:
 * - 图生 3D 快速模型生成
 * - 支持 GLB / OBJ 格式导出
 * - 任务状态跟踪
 */

import { config } from '@/config/index';
import { logger } from '@/utils/logger';
import { ai3d } from 'tencentcloud-sdk-nodejs-ai3d';
import { BaseModel3DProvider } from '../base';
import type { ModelJobResponse, ModelTaskStatusResponse, SubmitModelJobParams } from '../types';

// ============================================
// 配置常量
// ============================================

/**
 * 3D 模型导出格式
 * - OBJ: 通用格式，支持材质和纹理（当前使用）
 * - GLB: glTF 二进制格式，适合 Web 展示
 *
 * TODO: 后期支持通过参数动态选择格式
 */
const RESULT_FORMAT = 'OBJ' as const; // 当前硬编码为 OBJ

// 导入腾讯云 AI3D 客户端类型
const Ai3dClient = ai3d.v20250513.Client;

/**
 * 腾讯云混元 3D 适配器
 */
export class TencentModel3DAdapter extends BaseModel3DProvider {
	getName(): string {
		return 'TencentModel3DProvider';
	}

	/**
	 * 创建腾讯云 AI3D 客户端实例
	 */
	private createClient() {
		// 从配置读取密钥配置
		const secretId = config.providers.tencent.secretId;
		const secretKey = config.providers.tencent.secretKey;
		const region = config.providers.tencent.region || 'ap-guangzhou';

		// 验证必需的配置
		if (!secretId || !secretKey) {
			throw new Error(
				'腾讯云密钥配置缺失: TENCENTCLOUD_SECRET_ID 或 TENCENTCLOUD_SECRET_KEY 未设置',
			);
		}

		// 客户端配置
		const clientConfig = {
			credential: {
				secretId,
				secretKey,
			},
			region,
			profile: {
				httpProfile: {
					endpoint: 'ai3d.tencentcloudapi.com',
				},
			},
		};

		return new Ai3dClient(clientConfig);
	}

	/**
	 * 提交图生 3D 模型任务
	 */
	protected async submitModelGenerationJobImpl(
		params: SubmitModelJobParams,
	): Promise<ModelJobResponse> {
		try {
			// 创建客户端实例
			const client = this.createClient();

			// 构建 API 请求参数
			const apiParams = {
				ImageUrl: params.imageUrl, // 图片 URL（必填）
				ResultFormat: RESULT_FORMAT, // 模型导出格式（OBJ/GLB）
				EnablePBR: false, // 不启用 PBR 材质
			};

			logger.info({
				msg: '提交3D生成任务',
				imageUrl: `${params.imageUrl.substring(0, 80)}...`,
				resultFormat: RESULT_FORMAT,
				enablePBR: false,
			});

			// 调用腾讯云 API - 提交图生 3D 快速任务
			const response = await client.SubmitHunyuanTo3DRapidJob(apiParams);

			// 验证响应数据
			if (!response.JobId) {
				throw new Error('腾讯云 API 返回数据异常: 缺少 JobId');
			}

			// 返回格式化响应
			return {
				jobId: response.JobId,
				requestId: response.RequestId || '',
			};
		} catch (error) {
			// 处理腾讯云 SDK 原生错误
			const tencentError = error as { code?: string; message?: string };
			const errorMsg = tencentError.message || '未知错误';

			// 判断错误类型并记录日志
			if (errorMsg.includes('任务上限') || errorMsg.includes('并发') || errorMsg.includes('限流')) {
				logger.error({ msg: '腾讯云并发限制错误', error: errorMsg });
			} else if (
				errorMsg.includes('认证失败') ||
				errorMsg.includes('签名错误') ||
				errorMsg.includes('SecretId')
			) {
				logger.error({ msg: '腾讯云认证错误', error: errorMsg });
			} else if (errorMsg.includes('权限') || errorMsg.includes('余额')) {
				logger.error({ msg: '腾讯云权限/余额错误', error: errorMsg });
			}

			// 抛出包含详细信息的错误
			throw new Error(`腾讯云图生 3D 任务提交失败: ${errorMsg}`);
		}
	}

	/**
	 * 查询腾讯云 3D 模型生成任务状态
	 */
	protected async queryModelTaskStatusImpl(jobId: string): Promise<ModelTaskStatusResponse> {
		try {
			// 创建客户端实例
			const client = this.createClient();

			// 调用腾讯云 API - 查询快速任务状态
			const response = await client.QueryHunyuanTo3DRapidJob({
				JobId: jobId,
			});

			// 验证响应数据
			if (!response.Status) {
				throw new Error('腾讯云 API 返回数据异常: 缺少 Status 字段');
			}

			// 返回格式化响应
			return {
				jobId,
				status: response.Status as 'WAIT' | 'RUN' | 'DONE' | 'FAIL',
				errorCode: response.ErrorCode,
				errorMessage: response.ErrorMessage,
				resultFiles: response.ResultFile3Ds?.map((file) => ({
					type: file.Type,
					url: file.Url,
					previewImageUrl: file.PreviewImageUrl,
				})),
				requestId: response.RequestId || '',
			};
		} catch (error) {
			// 处理腾讯云 SDK 原生错误
			const tencentError = error as { code?: string; message?: string };
			const errorMsg = tencentError.message || '未知错误';

			// 状态查询失败通常是网络或临时性错误，可重试
			throw new Error(`腾讯云任务状态查询失败: ${errorMsg}`);
		}
	}
}
