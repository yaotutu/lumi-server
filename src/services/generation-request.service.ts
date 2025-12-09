/**
 * GenerationRequest 服务层 - 业务逻辑层
 *
 * 职责：
 * - GenerationRequest 实体的业务逻辑处理
 * - 任务状态管理、业务规则判断
 * - 调用 Repository 层进行数据访问
 */

import {
	generatedImageRepository,
	generationRequestRepository,
	imageJobRepository,
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
 * 自动创建：
 * - 1 个 GenerationRequest（无状态）
 * - 4 个 GeneratedImage（imageStatus=PENDING，imageUrl=null）
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

	// 创建生成请求
	const requestId = createId();
	const request = await generationRequestRepository.create({
		id: requestId,
		userId,
		prompt: trimmedPrompt,
		status: 'IMAGE_PENDING',
		phase: 'IMAGE_GENERATION',
	});

	// 创建 4 个 GeneratedImage 记录
	const imageData = Array.from({ length: 4 }, (_, index) => ({
		id: createId(),
		requestId,
		index,
		imageStatus: 'PENDING' as const,
		imageUrl: null,
	}));
	const images = await generatedImageRepository.createMany(imageData);

	// 创建 4 个 ImageGenerationJob 记录
	const jobData = images.map((image) => ({
		id: createId(),
		imageId: image.id,
		status: 'PENDING' as const,
		priority: 0,
		retryCount: 0,
	}));
	const jobs = await imageJobRepository.createMany(jobData);

	logger.info({
		msg: '✅ 创建生成请求',
		requestId: request.id,
		imageIds: images.map((i) => i.id).join(','),
		jobIds: jobs.map((j) => j.id).join(','),
	});

	// 查询完整的生成请求对象（包含关联数据）
	return getRequestById(request.id);
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

	// 调用 Repository 层删除数据库记录（级联删除 images 和 models）
	await generationRequestRepository.delete(requestId);

	logger.info({
		msg: '✅ 删除生成请求',
		requestId,
	});
}
