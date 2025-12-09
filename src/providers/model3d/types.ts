/**
 * Model3D Provider 类型定义
 *
 * 统一的 3D 模型生成服务接口
 */

/**
 * Model3D Provider 类型
 */
export type Model3DProviderType = 'tencent';

/**
 * 3D 模型生成任务提交参数
 */
export interface SubmitModelJobParams {
	imageUrl: string; // 图片 URL
	prompt?: string; // 可选的提示词
}

/**
 * 3D 模型任务提交响应
 */
export interface ModelJobResponse {
	jobId: string; // 任务 ID
	requestId: string; // 请求 ID
}

/**
 * 3D 模型任务状态
 */
export type ModelTaskStatus = 'WAIT' | 'RUN' | 'DONE' | 'FAIL';

/**
 * 3D 模型文件信息
 */
export interface ModelFile {
	type?: string; // 文件格式 (GLB, GLTF, etc.)
	url?: string; // 文件 URL
	previewImageUrl?: string; // 预览图片 URL
}

/**
 * 3D 模型任务状态响应
 */
export interface ModelTaskStatusResponse {
	jobId: string; // 任务 ID
	status: ModelTaskStatus; // 任务状态
	errorCode?: string; // 错误码
	errorMessage?: string; // 错误信息
	resultFiles?: ModelFile[]; // 结果文件列表
	requestId: string; // 请求 ID
}

/**
 * Model3D Provider 统一接口
 *
 * 所有 3D 模型生成适配器必须实现此接口
 */
export interface Model3DProvider {
	/**
	 * 提交 3D 模型生成任务
	 * @param params 任务参数
	 * @returns 任务响应（包含任务 ID）
	 */
	submitModelGenerationJob(params: SubmitModelJobParams): Promise<ModelJobResponse>;

	/**
	 * 查询 3D 模型任务状态
	 * @param jobId 任务 ID
	 * @returns 任务状态信息
	 */
	queryModelTaskStatus(jobId: string): Promise<ModelTaskStatusResponse>;

	/**
	 * 获取 Provider 名称
	 */
	getName(): string;
}
