/**
 * GenerationRequest 服务层 - 业务逻辑层
 *
 * 职责：
 * - GenerationRequest 实体的业务逻辑处理
 * - 任务状态管理、业务规则判断
 * - 调用 Repository 层进行数据访问
 */

import { createId } from '@paralleldrive/cuid2';
import { db } from '@/db/drizzle';
import { generatedImages, generationRequests, imageGenerationJobs } from '@/db/schema';
import { imageQueue, modelQueue } from '@/queues';
import {
	generatedImageRepository,
	generationRequestRepository,
	imageJobRepository,
	modelJobRepository,
	modelRepository,
	orphanedFileRepository,
} from '@/repositories';
import { NotFoundError, ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { storageService } from './storage.service.js';

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
 * 创建新的生成请求（快速返回版本）
 *
 * 使用数据库事务确保原子性：
 * - 1 个 GenerationRequest（只保存用户原始输入）
 * - 4 个 GeneratedImage（imageStatus=PENDING，imageUrl=null，imagePrompt=null）
 * - 4 个 ImageGenerationJob（status=PENDING）
 *
 * 注意：imagePrompt 初始为 null，后续由后台异步任务填充
 *
 * @param userId 用户ID
 * @param originalPrompt 用户原始输入的提示词
 * @returns 创建的生成请求对象（包含关联的 Images 和 Jobs）
 * @throws ValidationError - 提示词验证失败
 */
export async function createRequest(userId: string, originalPrompt: string) {
	const trimmedPrompt = originalPrompt.trim();

	// 验证提示词不为空
	if (trimmedPrompt.length === 0) {
		throw new ValidationError('提示词不能为空');
	}

	// 验证提示词长度
	if (trimmedPrompt.length > 500) {
		throw new ValidationError('提示词长度不能超过500个字符');
	}

	// ✅ 使用数据库事务确保原子性
	const requestId = createId();

	await db.transaction(async (tx) => {
		// 步骤 1: 创建 GenerationRequest（只保存用户原始输入）
		await tx.insert(generationRequests).values({
			id: requestId,
			externalUserId: userId,
			originalPrompt: trimmedPrompt, // ✅ 只保存用户原始输入
		});

		// 步骤 2: 创建 4 个 GeneratedImage 记录（imagePrompt 初始为 null，后续异步填充）
		const imageRecords = Array.from({ length: 4 }, (_, index) => ({
			id: createId(),
			requestId,
			index,
			imageStatus: 'PENDING' as const,
			imageUrl: null,
			imagePrompt: null, // ✅ 初始为 null，后续由后台任务填充
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
			msg: '✅ 快速创建生成请求（事务）',
			requestId,
			imageIds: imageRecords.map((i) => i.id).join(','),
			jobIds: jobRecords.map((j) => j.id).join(','),
			note: 'imagePrompt 将由后台异步任务填充',
		});
	});

	// 查询完整的生成请求对象（包含关联数据）
	return getRequestById(requestId);
}

/**
 * 异步处理：生成提示词变体并加入队列
 *
 * 业务流程:
 * 1. 调用 LLM 生成 4 个提示词变体
 * 2. 更新数据库中的 imagePrompt 字段
 * 3. 将 4 个 ImageJob 加入 BullMQ 队列
 * 4. 降级策略：LLM 失败时使用原始提示词
 *
 * @param requestId 生成请求 ID
 * @param originalPrompt 用户原始输入的提示词
 * @param userId 用户 ID
 */
export async function processPromptAndEnqueueJobs(
	requestId: string,
	originalPrompt: string,
	userId: string,
): Promise<void> {
	try {
		logger.info({
			msg: '🎨 开始异步处理提示词生成和任务入队',
			requestId,
			originalPrompt,
		});

		// 步骤 1: 调用 LLM 生成 4 个提示词变体
		let promptVariants: string[];
		try {
			const { processUserPromptForImageGeneration } = await import(
				'./prompt-optimizer.service.js'
			);
			const result = await processUserPromptForImageGeneration(originalPrompt);
			promptVariants = result.prompts;

			logger.info({
				msg: '✅ LLM 提示词生成成功',
				requestId,
				promptCount: promptVariants.length,
			});
		} catch (error) {
			// 降级策略：LLM 失败时使用原始提示词
			logger.warn({
				msg: '⚠️ LLM 提示词生成失败，降级使用原始提示词',
				requestId,
				error,
			});
			promptVariants = [originalPrompt, originalPrompt, originalPrompt, originalPrompt];
		}

		// 步骤 2: 查询该请求的所有图片记录
		const images = await generatedImageRepository.findByRequestId(requestId);
		if (images.length !== 4) {
			throw new Error(`期望 4 张图片记录，实际找到 ${images.length} 张`);
		}

		// 步骤 3: 更新每张图片的 imagePrompt 字段
		await Promise.all(
			images.map((image, index) =>
				generatedImageRepository.update(image.id, {
					imagePrompt: promptVariants[index],
				}),
			),
		);

		logger.info({
			msg: '✅ 已更新所有图片的 imagePrompt',
			requestId,
			imageIds: images.map((img) => img.id).join(','),
		});

		// 步骤 4: 查询每张图片关联的 Job，并加入队列
		const imageJobs = await Promise.all(
			images.map(async (image, index) => {
				// 查询该图片关联的 Job
				const job = await imageJobRepository.findByImageId(image.id);
				if (!job) {
					throw new Error(`Image ${image.id} 没有关联的 Job`);
				}

				// 加入 BullMQ 队列
				return imageQueue.add(`image-${image.id}`, {
					jobId: job.id,
					imageId: image.id,
					prompt: promptVariants[index],
					requestId,
					userId,
				});
			}),
		);

		logger.info({
			msg: '✅ 所有图片任务已加入队列',
			requestId,
			jobCount: imageJobs.length,
			queueJobIds: imageJobs.map((j) => j.id).join(','),
		});
	} catch (error) {
		logger.error({
			msg: '❌ 异步处理失败',
			requestId,
			error,
		});

		// 错误处理：更新请求状态为失败
		try {
			await generationRequestRepository.update(requestId, {
				status: 'FAILED',
				phase: 'IMAGE_GENERATION',
			});
		} catch (updateError) {
			logger.error({
				msg: '❌ 更新失败状态时出错',
				requestId,
				error: updateError,
			});
		}
	}
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

	// 检查幂等性：是否已经选择过图片并创建了模型
	const existingModel = await modelRepository.findByRequestId(requestId);
	if (existingModel) {
		logger.warn(
			{ requestId, existingModelId: existingModel.id },
			'⚠️ 该请求已经选择过图片并创建了模型',
		);
		throw new ValidationError('该请求已经选择过图片并创建了模型');
	}

	// 使用事务确保数据一致性
	const modelId = createId();
	const jobId = createId();

	try {
		await db.transaction(async (tx) => {
			// 1. 更新 GenerationRequest 状态
			await generationRequestRepository.updateWithTransaction(tx, requestId, {
				selectedImageIndex,
				phase: 'MODEL_GENERATION',
				status: 'MODEL_PENDING',
			});

			// 2. 创建 Model（默认为 PUBLIC，自动发布）
			await modelRepository.createWithTransaction(tx, {
				id: modelId,
				requestId,
				externalUserId: request.externalUserId,
				name: `模型-${requestId.substring(0, 8)}`,
				previewImageUrl: selectedImage.imageUrl,
				visibility: 'PUBLIC',
				publishedAt: new Date(), // 默认公开，设置发布时间
			});

			// 3. 创建 ModelGenerationJob
			await modelJobRepository.createWithTransaction(tx, {
				id: jobId,
				modelId,
				status: 'PENDING',
				priority: 0,
				retryCount: 0,
				progress: 0,
			});

			logger.info({
				msg: '✅ 数据库事务成功提交',
				requestId,
				modelId,
				jobId,
			});
		});
	} catch (error) {
		logger.error({
			msg: '❌ 数据库事务失败，已回滚',
			requestId,
			error,
		});
		throw error;
	}

	// 事务成功后，执行副作用操作（加入队列）
	await modelQueue.add(`model-${modelId}`, {
		jobId,
		modelId,
		imageUrl: selectedImage.imageUrl,
		requestId,
		externalUserId: request.externalUserId,
	});

	logger.info({
		msg: '✅ 已选择图片并触发3D模型生成',
		requestId,
		selectedImageIndex,
		modelId,
		jobId,
		imageUrl: selectedImage.imageUrl,
	});

	// 返回创建的模型数据
	const model = await modelRepository.findById(modelId);
	return {
		model,
		selectedImageIndex,
	};
}

/**
 * 从 S3 URL 提取 key
 * 支持多种 S3 URL 格式：
 * - 腾讯云 COS: https://{bucket}.cos.{region}.myqcloud.com/{key}
 * - MinIO: {endpoint}/{bucket}/{key}
 * - AWS S3: https://{bucket}.s3.{region}.amazonaws.com/{key}
 *
 * @param url S3 完整 URL
 * @returns S3 key（如 images/xxx/0.png 或 models/xxx/model.obj）
 */
function extractS3KeyFromUrl(url: string): string | null {
	try {
		// 尝试匹配 images/ 或 models/ 开头的路径
		const match = url.match(/(images\/[^?#]+|models\/[^?#]+)/);
		return match ? match[1] : null;
	} catch (error) {
		logger.warn({ url, error }, '无法从 URL 提取 S3 key');
		return null;
	}
}

/**
 * 删除生成请求及其所有资源（图片、模型文件）
 * @param requestId 生成请求ID
 * @throws NotFoundError - 生成请求不存在
 */
export async function deleteRequest(requestId: string) {
	// 验证生成请求存在
	await getRequestById(requestId);

	// 收集删除失败的文件 keys
	const failedFiles: Array<{ s3Key: string; requestId: string }> = [];

	// 1. 删除所有图片文件
	const images = await generatedImageRepository.findByRequestId(requestId);
	for (const image of images) {
		if (image.imageUrl) {
			const key = extractS3KeyFromUrl(image.imageUrl);
			if (key) {
				try {
					await storageService.delete(key);
					logger.info({ msg: '✅ 已删除图片文件', requestId, imageId: image.id, key });
				} catch (error) {
					// 删除失败：记录到孤儿文件表
					logger.warn({
						msg: '⚠️ 删除图片文件失败，已记录为孤儿文件',
						requestId,
						imageId: image.id,
						key,
						error,
					});
					failedFiles.push({ s3Key: key, requestId });
				}
			}
		}
	}

	// 2. 删除关联的模型文件和数据库记录（如果存在）
	const associatedModel = await modelRepository.findByRequestId(requestId);
	if (associatedModel) {
		// 删除模型相关的所有文件（modelUrl, mtlUrl, textureUrl）
		const modelUrls = [
			associatedModel.modelUrl,
			associatedModel.mtlUrl,
			associatedModel.textureUrl,
		].filter(Boolean) as string[];

		for (const url of modelUrls) {
			const key = extractS3KeyFromUrl(url);
			if (key) {
				try {
					await storageService.delete(key);
					logger.info({ msg: '✅ 已删除模型文件', requestId, modelId: associatedModel.id, key });
				} catch (error) {
					// 删除失败：记录到孤儿文件表
					logger.warn({
						msg: '⚠️ 删除模型文件失败，已记录为孤儿文件',
						requestId,
						modelId: associatedModel.id,
						key,
						error,
					});
					failedFiles.push({ s3Key: key, requestId });
				}
			}
		}

		// 删除模型数据库记录
		await modelRepository.delete(associatedModel.id);
		logger.info({
			msg: '✅ 已删除关联的模型记录',
			requestId,
			modelId: associatedModel.id,
		});
	}

	// 3. 调用 Repository 层删除数据库记录（级联删除 images）
	await generationRequestRepository.delete(requestId);

	// 4. 批量记录删除失败的文件到孤儿文件表
	if (failedFiles.length > 0) {
		await orphanedFileRepository.batchCreate(failedFiles);
		logger.warn({
			msg: '⚠️ 部分文件删除失败，已记录到孤儿文件表',
			requestId,
			failedCount: failedFiles.length,
		});
	}

	logger.info({
		msg: '✅ 删除生成请求完成',
		requestId,
		deletedImages: images.length,
		deletedModel: !!associatedModel,
		failedFiles: failedFiles.length,
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
	if (request.externalUserId !== userId) {
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
	const _request = await getRequestById(requestId);

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
