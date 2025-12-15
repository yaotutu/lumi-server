/**
 * GenerationRequest 服务层 - 业务逻辑层
 *
 * 职责：
 * - GenerationRequest 实体的业务逻辑处理
 * - 任务状态管理、业务规则判断
 * - 调用 Repository 层进行数据访问
 */

import { db } from '@/db/drizzle';
import { generatedImages, generationRequests, imageGenerationJobs } from '@/db/schema';
import { modelQueue } from '@/queues';
import {
	generatedImageRepository,
	generationRequestRepository,
	imageJobRepository,
	modelJobRepository,
	modelRepository,
} from '@/repositories';
import { NotFoundError, ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { createId } from '@paralleldrive/cuid2';

/**
 * 获取生成请求列表
 * @param userId 用户ID
 * @param options 查询选项（分页限制）
 * @returns 生成请求列表（包含关联的图片和模型）
 */
export async function listRequests(
	userId: string,
	options?: {
		limit?: number;
	},
) {
	return generationRequestRepository.findByUserId(userId, options);
}

/**
 * 根据ID获取生成请求详情
 * @param requestId 生成请求ID
 * @returns 生成请求详情
 * @throws NotFoundError - 生成请求不存在
 */
export async function getRequestById(requestId: string) {
	const request = await generationRequestRepository.findById(requestId);

	if (!request) {
		throw new NotFoundError(`生成请求不存在: ${requestId}`);
	}

	return request;
}

/**
 * 创建新的生成请求
 *
 * 使用数据库事务确保原子性：
 * - 1 个 GenerationRequest（无状态）
 * - 4 个 GeneratedImage（imageStatus=PENDING，imageUrl=null，imagePrompt=风格变体）
 * - 4 个 ImageGenerationJob（status=PENDING）
 *
 * @param userId 用户ID
 * @param prompt 文本提示词（已验证）
 * @returns 创建的生成请求对象（包含关联的 Images 和 Jobs）
 * @throws ValidationError - 提示词验证失败
 */
export async function createRequest(userId: string, prompt: string) {
	const trimmedPrompt = prompt.trim();

	// 验证提示词不为空
	if (trimmedPrompt.length === 0) {
		throw new ValidationError('提示词不能为空');
	}

	// 验证提示词长度
	if (trimmedPrompt.length > 500) {
		throw new ValidationError('提示词长度不能超过500个字符');
	}

	// 🤖 生成 4 个不同风格的提示词变体
	logger.info({
		msg: '🎨 开始生成多风格提示词变体',
		originalPrompt: trimmedPrompt,
	});

	let promptVariants: string[];
	try {
		const { generateMultiStylePrompts } = await import('./prompt-optimizer.service.js');
		promptVariants = await generateMultiStylePrompts(trimmedPrompt);

		logger.info({
			msg: '✅ 提示词变体生成成功',
			variantsCount: promptVariants.length,
			variants: promptVariants,
		});
	} catch (error) {
		// 降级策略：LLM 调用失败时，使用原始提示词的 4 个副本
		logger.warn({
			msg: '⚠️ 提示词变体生成失败，使用原始提示词',
			error: error instanceof Error ? error.message : String(error),
		});
		promptVariants = [trimmedPrompt, trimmedPrompt, trimmedPrompt, trimmedPrompt];
	}

	// ✅ 使用数据库事务确保原子性
	const requestId = createId();

	await db.transaction(async (tx) => {
		// 步骤 1: 创建 GenerationRequest
		await tx.insert(generationRequests).values({
			id: requestId,
			userId,
			prompt: trimmedPrompt,
			status: 'IMAGE_PENDING',
			phase: 'IMAGE_GENERATION',
		});

		// 步骤 2: 创建 4 个 GeneratedImage 记录（每个使用不同的提示词变体）
		const imageRecords = Array.from({ length: 4 }, (_, index) => ({
			id: createId(),
			requestId,
			index,
			imageStatus: 'PENDING' as const,
			imageUrl: null,
			imagePrompt: promptVariants[index], // ✅ 分配对应的提示词变体
		}));
		await tx.insert(generatedImages).values(imageRecords);

		// 步骤 3: 创建 4 个 ImageGenerationJob 记录
		const jobRecords = imageRecords.map((image) => ({
			id: createId(),
			imageId: image.id,
			status: 'PENDING' as const,
			priority: 0,
			retryCount: 0,
		}));
		await tx.insert(imageGenerationJobs).values(jobRecords);

		logger.info({
			msg: '✅ 创建生成请求（事务）',
			requestId,
			imageIds: imageRecords.map((i) => i.id).join(','),
			jobIds: jobRecords.map((j) => j.id).join(','),
			promptVariantsAssigned: imageRecords.map(
				(i, idx) => `[${idx}]: ${i.imagePrompt?.substring(0, 50)}...`,
			),
		});
	});

	// 查询完整的生成请求对象（包含关联数据）
	return getRequestById(requestId);
}

/**
 * 选择图片并触发3D模型生成
 *
 * 业务流程:
 * 1. 验证请求存在且处于正确状态
 * 2. 验证图片已生成完成
 * 3. 更新 GenerationRequest (selectedImageIndex, phase, status)
 * 4. 创建 Model 和 ModelGenerationJob
 * 5. 加入 modelQueue
 *
 * @param requestId 生成请求ID
 * @param selectedImageIndex 选择的图片索引 (0-3)
 * @returns 模型和选择的图片索引
 * @throws ValidationError - 业务验证失败
 * @throws NotFoundError - 请求或图片不存在
 */
export async function selectImageAndGenerateModel(requestId: string, selectedImageIndex: number) {
	// 验证生成请求存在
	const request = await getRequestById(requestId);

	// 验证请求状态 - 必须在等待选择阶段（图片已生成完成）
	if (request.phase !== 'AWAITING_SELECTION') {
		throw new ValidationError('请求不在等待选择阶段,无法选择图片');
	}

	// 获取所有图片
	const images = await generatedImageRepository.findByRequestId(requestId);
	if (images.length === 0) {
		throw new NotFoundError('未找到生成的图片');
	}

	// 验证选择的图片存在
	const selectedImage = images.find((img) => img.index === selectedImageIndex);
	if (!selectedImage) {
		throw new NotFoundError(`图片索引 ${selectedImageIndex} 不存在`);
	}

	// 验证图片已完成
	if (selectedImage.imageStatus !== 'COMPLETED' || !selectedImage.imageUrl) {
		throw new ValidationError(`图片 ${selectedImageIndex} 尚未生成完成`);
	}

	// 更新 GenerationRequest 状态
	await generationRequestRepository.update(requestId, {
		selectedImageIndex,
		phase: 'MODEL_GENERATION',
		status: 'MODEL_PENDING',
	});

	// 创建 Model（默认为 PUBLIC，自动发布）
	const modelId = createId();
	const model = await modelRepository.create({
		id: modelId,
		requestId,
		userId: request.userId,
		name: `模型-${requestId.substring(0, 8)}`,
		previewImageUrl: selectedImage.imageUrl,
		visibility: 'PUBLIC',
		publishedAt: new Date(), // 默认公开，设置发布时间
	});

	// 创建 ModelGenerationJob
	const jobId = createId();
	await modelJobRepository.create({
		id: jobId,
		modelId,
		status: 'PENDING',
		priority: 0,
		retryCount: 0,
		progress: 0,
	});

	// 加入模型生成队列
	await modelQueue.add(`model-${modelId}`, {
		jobId,
		modelId,
		imageUrl: selectedImage.imageUrl,
		requestId,
		userId: request.userId,
	});

	logger.info({
		msg: '✅ 已选择图片并触发3D模型生成',
		requestId,
		selectedImageIndex,
		modelId,
		jobId,
		imageUrl: selectedImage.imageUrl,
	});

	return {
		model,
		selectedImageIndex,
	};
}

/**
 * 删除生成请求及其所有资源（图片、模型文件）
 * @param requestId 生成请求ID
 * @throws NotFoundError - 生成请求不存在
 */
export async function deleteRequest(requestId: string) {
	// 验证生成请求存在
	await getRequestById(requestId);

	// TODO: 删除文件资源（图片和模型）
	// const storageProvider = createStorageProvider();
	// await storageProvider.deleteTaskResources(requestId);

	// 1. 先删除关联的模型记录（如果存在）
	const associatedModel = await modelRepository.findByRequestId(requestId);
	if (associatedModel) {
		await modelRepository.delete(associatedModel.id);
		logger.info({
			msg: '✅ 已删除关联的模型',
			requestId,
			modelId: associatedModel.id,
		});
	}

	// 2. 调用 Repository 层删除数据库记录（级联删除 images）
	await generationRequestRepository.delete(requestId);

	logger.info({
		msg: '✅ 删除生成请求',
		requestId,
	});
}

/**
 * 提交打印任务
 *
 * 业务流程:
 * 1. 验证请求存在和用户权限
 * 2. 验证模型已生成完成
 * 3. 检查是否已提交过打印
 * 4. 生成 sliceTaskId
 * 5. 更新 model.sliceTaskId 和 printStatus
 *
 * @param requestId 生成请求ID
 * @param userId 用户ID（权限验证）
 * @returns 打印任务信息
 * @throws ValidationError - 业务验证失败
 * @throws NotFoundError - 请求或模型不存在
 */
export async function submitPrintTask(requestId: string, userId: string) {
	// 验证生成请求存在
	const request = await getRequestById(requestId);

	// 验证用户权限
	if (request.userId !== userId) {
		throw new ValidationError('无权限操作此生成请求');
	}

	// 验证请求已完成模型生成
	if (request.phase !== 'MODEL_GENERATION' && request.phase !== 'COMPLETED') {
		throw new ValidationError('请求尚未完成模型生成,无法提交打印');
	}

	// 获取模型
	const model = await modelRepository.findByRequestId(requestId);
	if (!model) {
		throw new NotFoundError('未找到关联的模型');
	}

	// 验证模型已完成生成
	if (!model.modelUrl) {
		throw new ValidationError('模型尚未生成完成,无法提交打印');
	}

	// 检查是否已提交打印
	if (model.sliceTaskId && model.printStatus !== 'FAILED') {
		throw new ValidationError('打印任务已提交,请勿重复提交');
	}

	// 生成 sliceTaskId (实际项目中应调用外部打印服务 API)
	const sliceTaskId = `slice-${createId()}`;

	// 更新模型状态
	await modelRepository.update(model.id, {
		sliceTaskId,
		printStatus: 'SLICING',
	});

	logger.info({
		msg: '✅ 提交打印任务',
		requestId,
		modelId: model.id,
		sliceTaskId,
	});

	// TODO: 调用外部打印服务 API
	// const printProvider = createPrintProvider();
	// const printResult = await printProvider.submitSliceTask({
	//   modelUrl: model.modelUrl,
	//   format: model.format,
	// });

	return {
		modelId: model.id,
		sliceTaskId,
		printResult: {
			status: 'SLICING',
			message: '切片任务已提交',
		},
	};
}

/**
 * 查询打印状态
 *
 * 业务流程:
 * 1. 验证请求存在
 * 2. 获取模型的 sliceTaskId 和 printStatus
 * 3. 返回打印状态和进度
 *
 * @param requestId 生成请求ID
 * @returns 打印状态信息
 * @throws NotFoundError - 请求或模型不存在
 * @throws ValidationError - 尚未提交打印
 */
export async function getPrintStatus(requestId: string) {
	// 验证生成请求存在
	const request = await getRequestById(requestId);

	// 获取模型
	const model = await modelRepository.findByRequestId(requestId);
	if (!model) {
		throw new NotFoundError('未找到关联的模型');
	}

	// 检查是否已提交打印
	if (!model.sliceTaskId) {
		throw new ValidationError('尚未提交打印任务');
	}

	// TODO: 调用外部打印服务查询状态
	// const printProvider = createPrintProvider();
	// const status = await printProvider.getSliceTaskStatus(model.sliceTaskId);

	// 模拟返回打印进度
	const progressMap: Record<string, number> = {
		NOT_STARTED: 0,
		SLICING: 30,
		SLICE_COMPLETE: 50,
		PRINTING: 75,
		PRINT_COMPLETE: 100,
		FAILED: 0,
	};

	return {
		printStatus: model.printStatus,
		sliceTaskId: model.sliceTaskId,
		progress: progressMap[model.printStatus || 'NOT_STARTED'],
	};
}
