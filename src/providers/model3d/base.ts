/**
 * Model3D Provider 抽象基类
 *
 * 职责：
 * - 定义统一的接口和公共逻辑
 * - 提供日志记录
 * - 错误处理
 */

import { logger } from '@/utils/logger';
import type {
	Model3DProvider,
	ModelJobResponse,
	ModelTaskStatusResponse,
	SubmitModelJobParams,
} from './types';

/**
 * Model3D Provider 抽象基类
 *
 * 子类需要实现：
 * - getName(): 返回渠道名称
 * - submitModelGenerationJobImpl(): 提交任务的具体实现
 * - queryModelTaskStatusImpl(): 查询状态的具体实现
 */
export abstract class BaseModel3DProvider implements Model3DProvider {
	/**
	 * 获取 Provider 名称（子类实现）
	 */
	abstract getName(): string;

	/**
	 * 提交任务的具体实现（子类实现）
	 */
	protected abstract submitModelGenerationJobImpl(
		params: SubmitModelJobParams,
	): Promise<ModelJobResponse>;

	/**
	 * 查询状态的具体实现（子类实现）
	 */
	protected abstract queryModelTaskStatusImpl(jobId: string): Promise<ModelTaskStatusResponse>;

	/**
	 * 提交 3D 模型生成任务 - 公共实现
	 */
	async submitModelGenerationJob(params: SubmitModelJobParams): Promise<ModelJobResponse> {
		logger.info({
			msg: '提交 3D 模型生成任务',
			provider: this.getName(),
			imageUrl: params.imageUrl,
			hasPrompt: !!params.prompt,
		});

		try {
			const response = await this.submitModelGenerationJobImpl(params);

			logger.info({
				msg: '任务提交成功',
				provider: this.getName(),
				jobId: response.jobId,
				requestId: response.requestId,
			});

			return response;
		} catch (error) {
			logger.error({
				msg: '任务提交失败',
				provider: this.getName(),
				error,
			});
			throw error;
		}
	}

	/**
	 * 查询 3D 模型任务状态 - 公共实现
	 */
	async queryModelTaskStatus(jobId: string): Promise<ModelTaskStatusResponse> {
		logger.info({
			msg: '查询任务状态',
			provider: this.getName(),
			jobId,
		});

		try {
			const response = await this.queryModelTaskStatusImpl(jobId);

			logger.info({
				msg: '查询成功',
				provider: this.getName(),
				jobId,
				status: response.status,
				hasResultFiles: !!response.resultFiles && response.resultFiles.length > 0,
			});

			return response;
		} catch (error) {
			logger.error({
				msg: '查询失败',
				provider: this.getName(),
				jobId,
				error,
			});
			throw error;
		}
	}
}
