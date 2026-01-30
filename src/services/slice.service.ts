/**
 * Slice Service
 * 切片服务层
 *
 * 从 slices.route.ts 搬运过来的业务逻辑
 */

import { getSlicerServiceClient } from '@/clients/slicer';
import { config } from '@/config/index.js';
import { modelRepository } from '@/repositories/index.js';
import { ValidationError } from '@/utils/errors.js';
import { logger } from '@/utils/logger.js';

/**
 * 创建切片任务（从 Router 搬运的完整逻辑）
 *
 * @param userId 用户 ID
 * @param modelId 模型 ID
 * @returns 切片任务创建结果
 */
export async function createSliceTask(
	userId: string,
	modelId: string,
): Promise<{
	modelId: string;
	sliceTaskId: string;
	sliceStatus: string;
	message: string;
}> {
	logger.info({
		msg: '📥 收到创建切片任务请求',
		modelId,
		userId,
	});

	// 👇 从 Router 搬运的验证逻辑（原封不动）
	// 第 2 步：验证模型存在且属于当前用户
	const model = await modelRepository.findById(modelId);
	if (!model) {
		logger.warn({
			msg: '⚠️ 模型不存在',
			modelId,
			userId,
		});
		throw new ValidationError('模型不存在');
	}

	// 检查模型所有权
	if (model.externalUserId !== userId) {
		logger.warn({
			msg: '⚠️ 无权访问该模型',
			modelId,
			userId,
			modelOwner: model.externalUserId,
		});
		throw new ValidationError('无权访问该模型');
	}

	// 第 3 步：检查模型是否已生成完成
	if (!model.modelUrl) {
		logger.warn({
			msg: '⚠️ 模型尚未生成完成',
			modelId,
		});
		throw new ValidationError('模型尚未生成完成，无法进行切片');
	}

	// 第 4 步：检查是否已有切片任务（防止重复提交）
	if (model.sliceStatus && model.sliceStatus !== 'FAILED') {
		logger.warn({
			msg: '⚠️ 切片任务已存在',
			modelId,
			currentStatus: model.sliceStatus,
		});
		throw new ValidationError(`切片任务已存在，当前状态：${model.sliceStatus}`);
	}

	// 第 5 步：初始化切片服务客户端
	const slicerClient = getSlicerServiceClient({
		baseUrl: config.slicerService.url,
		timeout: config.slicerService.timeout,
	});

	// 第 6 步：从代理 URL 中提取原始模型 URL
	const fileName = `${modelId}.${model.format?.toLowerCase() || 'obj'}`;

	// 从代理 URL 中提取原始 URL
	// model.modelUrl 格式: /api/proxy/model?url=https%3A%2F%2F...
	// 需要提取 url 参数并解码，得到原始的 COS URL
	let objectUrl: string;

	// 优先检查是否是代理 URL（无论是完整 URL 还是相对路径）
	if (model.modelUrl.includes('/api/proxy/model?url=')) {
		// 是代理 URL，提取原始 URL
		const urlMatch = model.modelUrl.match(/[?&]url=([^&]+)/);
		if (urlMatch) {
			objectUrl = decodeURIComponent(urlMatch[1]);
			logger.info({
				msg: '✅ 从代理 URL 中提取原始 URL',
				proxyUrl: model.modelUrl,
				extractedUrl: objectUrl,
			});
		} else {
			throw new Error('无法从代理 URL 中提取原始 URL');
		}
	} else if (model.modelUrl.startsWith('https://')) {
		// 已经是 HTTPS URL，直接使用
		objectUrl = model.modelUrl;
		logger.info({
			msg: '✅ 使用原始 HTTPS URL',
			url: objectUrl,
		});
	} else {
		// 其他情况，抛出错误
		throw new Error(`不支持的 modelUrl 格式: ${model.modelUrl}`);
	}

	logger.info({
		msg: '🎨 调用外部切片服务创建任务',
		originalModelUrl: model.modelUrl,
		extractedObjectUrl: objectUrl,
		fileName,
		slicerServiceUrl: config.slicerService.url,
	});

	// 第 7 步：同步调用外部服务创建切片任务
	let sliceTaskId: string;
	try {
		const createResponse = await slicerClient.createSliceTask({
			object_url: objectUrl,
			file_name: fileName,
		});

		sliceTaskId = createResponse.slice_task_id;

		logger.info({
			msg: '✅ 切片任务已在外部服务创建',
			sliceTaskId,
			status: createResponse.status,
			message: createResponse.message,
		});
	} catch (error) {
		logger.error({
			msg: '❌ 调用外部切片服务失败',
			modelId,
			error: error instanceof Error ? error.message : String(error),
		});

		throw new Error('切片服务暂时不可用，请稍后重试');
	}

	// 第 8 步：保存切片任务 ID 和状态到数据库
	await modelRepository.update(modelId, {
		sliceTaskId,
		sliceStatus: 'PROCESSING', // 已创建，等待处理中
		gcodeUrl: null, // 清空旧的结果
		gcodeMetadata: null,
	});

	logger.info({
		msg: '✅ 切片任务已创建完成',
		modelId,
		sliceTaskId,
	});

	// 第 9 步：返回成功响应
	return {
		modelId,
		sliceTaskId, // ✅ 返回任务 ID 给前端
		sliceStatus: 'PROCESSING',
		message: '切片任务已创建，正在处理中',
	};
}

/**
 * 查询切片任务状态（从 Router 搬运的完整逻辑）
 *
 * @param sliceTaskId 切片任务 ID
 * @returns 切片任务状态
 */
export async function getSliceTaskStatus(sliceTaskId: string) {
	logger.info({
		msg: '📥 收到查询切片任务状态请求',
		sliceTaskId,
	});

	// 👇 从 Router 搬运的查询逻辑（原封不动）
	// 第 1 步：初始化切片服务客户端
	const slicerClient = getSlicerServiceClient({
		baseUrl: config.slicerService.url,
		timeout: config.slicerService.timeout,
	});

	// 第 2 步：调用外部服务查询状态
	let statusResponse: Awaited<ReturnType<typeof slicerClient.getSliceTaskStatus>>;
	try {
		statusResponse = await slicerClient.getSliceTaskStatus(sliceTaskId);

		logger.info({
			msg: '✅ 查询到切片任务状态',
			sliceTaskId,
			status: statusResponse.status,
			progress: statusResponse.progress,
		});
	} catch (error) {
		logger.error({
			msg: '❌ 调用外部切片服务失败',
			sliceTaskId,
			error: error instanceof Error ? error.message : String(error),
		});

		throw new Error('切片服务暂时不可用，请稍后重试');
	}

	// 第 3 步：从数据库查询模型信息
	const model = await modelRepository.findBySliceTaskId(sliceTaskId);
	if (!model) {
		logger.warn({
			msg: '⚠️ 数据库中未找到对应的模型',
			sliceTaskId,
		});
		throw new ValidationError('切片任务不存在');
	}

	// 第 4 步：如果切片完成，更新数据库（可选，用于缓存结果）
	if (statusResponse.status === 'COMPLETED' && statusResponse.gcode_download_url) {
		if (model.sliceStatus !== 'COMPLETED') {
			// 只在状态不是 COMPLETED 时更新（避免重复更新）
			await modelRepository.update(model.id, {
				sliceStatus: 'COMPLETED',
				gcodeUrl: statusResponse.gcode_download_url,
				gcodeMetadata: statusResponse.gcode_metadata || null,
			});

			logger.info({
				msg: '✅ 切片完成，已更新数据库',
				modelId: model.id,
				sliceTaskId,
			});
		}
	}

	// 第 5 步：返回完整的响应数据（符合 Schema 定义）
	return {
		sliceTaskId: statusResponse.id,
		modelId: model.id, // ✅ 从数据库获取
		sliceStatus: statusResponse.status as 'PENDING' | 'FETCHING' | 'PROCESSING' | 'COMPLETED' | 'FAILED', // ✅ 映射为 sliceStatus
		gcodeUrl: statusResponse.gcode_download_url || null,
		gcodeMetadata: statusResponse.gcode_metadata || null,
		errorMessage: statusResponse.error_message || null,
		updatedAt: model.updatedAt.toISOString(), // ✅ 从数据库获取
	};
}
