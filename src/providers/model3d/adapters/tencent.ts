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

import { ai3d } from 'tencentcloud-sdk-nodejs-ai3d';
import { config } from '@/config/index';
import { logger } from '@/utils/logger';
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

			// 打印完整的请求报文
			logger.info({
				msg: '📤 [TencentModel3DProvider] 提交 3D 生成任务',
				endpoint: 'ai3d.tencentcloudapi.com',
				action: 'SubmitHunyuanTo3DRapidJob',
				params: {
					...apiParams,
					ImageUrl: `${params.imageUrl.substring(0, 80)}...`, // 截断 URL
				},
			});

			// 调用腾讯云 API - 提交图生 3D 快速任务
			const response = await client.SubmitHunyuanTo3DRapidJob(apiParams);

			// 打印完整的响应报文
			logger.info({
				msg: '📥 [TencentModel3DProvider] 收到响应',
				endpoint: 'ai3d.tencentcloudapi.com',
				action: 'SubmitHunyuanTo3DRapidJob',
				response: {
					JobId: response.JobId,
					RequestId: response.RequestId,
				},
			});

			// 验证响应数据
			if (!response.JobId) {
				logger.error({
					msg: '❌ [TencentModel3DProvider] API 返回数据异常',
					response,
				});
				throw new Error('腾讯云 API 返回数据异常: 缺少 JobId');
			}

			logger.info({
				msg: '✅ [TencentModel3DProvider] 3D 任务提交成功',
				jobId: response.JobId,
				requestId: response.RequestId,
			});

			// 返回格式化响应
			return {
				jobId: response.JobId,
				requestId: response.RequestId || '',
			};
		} catch (error) {
			// 处理腾讯云 SDK 原生错误
			const tencentError = error as { code?: string; message?: string };
			const errorMsg = tencentError.message || '未知错误';

			// 详细的错误日志
			logger.error({
				msg: '❌ [TencentModel3DProvider] 提交任务失败',
				endpoint: 'ai3d.tencentcloudapi.com',
				action: 'SubmitHunyuanTo3DRapidJob',
				errorCode: tencentError.code,
				errorMessage: errorMsg,
				stack: error instanceof Error ? error.stack : undefined,
			});

			// 判断错误类型并记录日志
			if (errorMsg.includes('任务上限') || errorMsg.includes('并发') || errorMsg.includes('限流')) {
				logger.error({
					msg: '⚠️ [TencentModel3DProvider] 腾讯云并发限制错误',
					error: errorMsg,
				});
			} else if (
				errorMsg.includes('认证失败') ||
				errorMsg.includes('签名错误') ||
				errorMsg.includes('SecretId')
			) {
				logger.error({
					msg: '⚠️ [TencentModel3DProvider] 腾讯云认证错误',
					error: errorMsg,
				});
			} else if (errorMsg.includes('权限') || errorMsg.includes('余额')) {
				logger.error({
					msg: '⚠️ [TencentModel3DProvider] 腾讯云权限/余额错误',
					error: errorMsg,
				});
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

			// 打印请求信息
			logger.info({
				msg: '📤 [TencentModel3DProvider] 查询任务状态',
				endpoint: 'ai3d.tencentcloudapi.com',
				action: 'QueryHunyuanTo3DRapidJob',
				params: { JobId: jobId },
			});

			// 调用腾讯云 API - 查询快速任务状态
			const response = await client.QueryHunyuanTo3DRapidJob({
				JobId: jobId,
			});

			// 打印完整的响应报文
			logger.info({
				msg: '📥 [TencentModel3DProvider] 收到响应',
				endpoint: 'ai3d.tencentcloudapi.com',
				action: 'QueryHunyuanTo3DRapidJob',
				response: {
					JobId: jobId,
					Status: response.Status,
					ErrorCode: response.ErrorCode,
					ErrorMessage: response.ErrorMessage,
					ResultFiles: response.ResultFile3Ds?.map((file) => ({
						Type: file.Type,
						Url: file.Url ? `${file.Url.substring(0, 80)}...` : undefined,
						PreviewImageUrl: file.PreviewImageUrl
							? `${file.PreviewImageUrl.substring(0, 80)}...`
							: undefined,
					})),
					RequestId: response.RequestId,
				},
			});

			// 验证响应数据
			if (!response.Status) {
				logger.error({
					msg: '❌ [TencentModel3DProvider] API 返回数据异常',
					response,
				});
				throw new Error('腾讯云 API 返回数据异常: 缺少 Status 字段');
			}

			// 根据状态记录不同级别的日志
			const status = response.Status as 'WAIT' | 'RUN' | 'DONE' | 'FAIL';
			if (status === 'FAIL') {
				logger.error({
					msg: '❌ [TencentModel3DProvider] 任务失败',
					jobId,
					status,
					errorCode: response.ErrorCode,
					errorMessage: response.ErrorMessage,
				});
			} else if (status === 'DONE') {
				logger.info({
					msg: '✅ [TencentModel3DProvider] 任务完成',
					jobId,
					status,
					resultFileCount: response.ResultFile3Ds?.length || 0,
				});
			} else {
				logger.info({
					msg: '⏳ [TencentModel3DProvider] 任务进行中',
					jobId,
					status,
				});
			}

			// 返回格式化响应
			return {
				jobId,
				status,
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

			// 详细的错误日志
			logger.error({
				msg: '❌ [TencentModel3DProvider] 查询任务状态失败',
				endpoint: 'ai3d.tencentcloudapi.com',
				action: 'QueryHunyuanTo3DRapidJob',
				jobId,
				errorCode: tencentError.code,
				errorMessage: errorMsg,
				stack: error instanceof Error ? error.stack : undefined,
			});

			// 状态查询失败通常是网络或临时性错误，可重试
			throw new Error(`腾讯云任务状态查询失败: ${errorMsg}`);
		}
	}
}
