import { createId } from '@paralleldrive/cuid2';
import type { GeneratedImage } from '@/db/schema';
/**
 * Model 服务层
 */
import {
	generatedImageRepository,
	generationRequestRepository,
	modelJobRepository,
	modelRepository,
} from '@/repositories';
import { ForbiddenError, InvalidStateError, NotFoundError, ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { storageService } from './storage.service.js';

export async function getModelById(modelId: string) {
	const model = await modelRepository.findById(modelId);
	if (!model) throw new NotFoundError(`模型不存在: ${modelId}`);

	// 临时方案：用 externalUserId 构造 user 对象（等外部服务提供查询接口后升级）
	if (model.externalUserId) {
		model.user = {
			id: model.externalUserId,
			name: model.externalUserId,
			email: model.externalUserId,
		};
	}

	return model;
}

/**
 * 获取用户模型列表（基础版本）
 * 从 user.route.ts 搬运过来的逻辑
 */
export async function getUserModels(
	userId: string,
	options?: {
		visibility?: 'PUBLIC' | 'PRIVATE';
		sortBy?: 'latest' | 'name' | 'popular';
		limit?: number;
		offset?: number;
	},
) {
	// 👇 从 Router 搬运的逻辑（原封不动）
	const models = await modelRepository.findByUserId(userId, {
		visibility: options?.visibility,
		sortBy: options?.sortBy || 'latest',
		limit: options?.limit,
		offset: options?.offset,
	});

	return models;
}

/**
 * 获取用户模型列表（带统计信息）
 */
export async function getUserModelsWithStats(
	userId: string,
	options?: {
		visibility?: 'PUBLIC' | 'PRIVATE';
		sortBy?: 'latest' | 'name' | 'popular';
		limit?: number;
		offset?: number;
	},
) {
	const { visibility, sortBy = 'latest', limit = 20, offset = 0 } = options || {};

	// 获取模型列表
	const items = await modelRepository.findByUserId(userId, {
		visibility,
		sortBy,
		limit,
		offset,
	});

	// 获取总数
	const total = await modelRepository.countByUserId(userId);

	// 获取公开模型数
	const publicCount = await modelRepository.countByUserId(userId, { visibility: 'PUBLIC' });

	// 计算是否还有更多
	const hasMore = offset + items.length < total;

	return {
		items,
		total,
		publicCount,
		hasMore,
	};
}

export async function getPublicModels(options?: {
	limit?: number;
	offset?: number;
	sortBy?: 'latest' | 'popular' | 'liked';
}) {
	const { offset = 0 } = options || {};

	// 获取模型列表（包含用户信息）
	const items = await modelRepository.findPublicModels(options);

	// 临时方案：用 externalUserId 构造 user 对象（等外部服务提供查询接口后升级）
	const itemsWithUser = items.map((model) => {
		if (model.externalUserId) {
			return {
				...model,
				user: {
					id: model.externalUserId,
					name: model.externalUserId,
					email: model.externalUserId,
				},
			};
		}
		return model;
	});

	// 获取总数
	const total = await modelRepository.countPublicModels();

	// 计算是否还有更多
	const hasMore = offset + itemsWithUser.length < total;

	return {
		items: itemsWithUser,
		total,
		hasMore,
	};
}

export async function createModelForRequest(requestId: string, imageIndex: number) {
	const request = await generationRequestRepository.findById(requestId);
	if (!request) throw new NotFoundError(`生成请求不存在: ${requestId}`);
	if (request.phase !== 'AWAITING_SELECTION' && request.status !== 'IMAGE_COMPLETED') {
		throw new InvalidStateError('请求状态不允许创建模型');
	}
	const existingModel = await modelRepository.findByRequestId(requestId);
	if (existingModel) throw new InvalidStateError('该请求已有关联模型');
	if (imageIndex < 0 || imageIndex > 3) throw new ValidationError('图片索引无效');

	// 查询关联的 GeneratedImage 记录
	const images = await generatedImageRepository.findByRequestId(requestId);
	const selectedImage = images.find((img: GeneratedImage) => img.index === imageIndex);
	if (!selectedImage) throw new NotFoundError(`图片不存在: index=${imageIndex}`);
	if (selectedImage.imageStatus !== 'COMPLETED' || !selectedImage.imageUrl) {
		throw new InvalidStateError('选中的图片尚未生成完成');
	}
	// ✅ 使用 originalPrompt（用户原始输入）生成模型名称，回退到 requestId 的前 20 个字符
	const promptForName = request.originalPrompt || request.id;
	const modelName = `${promptForName.substring(0, 20)}_model`;
	await generationRequestRepository.update(requestId, { selectedImageIndex: imageIndex });

	// 创建 Model 记录（默认为 PUBLIC）
	const modelId = createId();
	const model = await modelRepository.create({
		id: modelId,
		externalUserId: request.externalUserId,
		requestId,
		sourceImageId: selectedImage.id,
		name: modelName,
		previewImageUrl: selectedImage.imageUrl,
		visibility: 'PUBLIC',
		publishedAt: new Date(), // 默认公开，设置发布时间
	});

	// 创建 ModelGenerationJob 记录
	const jobId = createId();
	await modelJobRepository.create({
		id: jobId,
		modelId: model.id,
		status: 'PENDING',
		priority: 0,
		progress: 0,
		retryCount: 0,
	});

	logger.info({ msg: '✅ 创建3D模型任务', modelId: model.id, jobId, requestId, imageIndex });
	return getModelById(model.id);
}

export async function updateModel(
	modelId: string,
	userId: string,
	data: { name?: string; description?: string },
) {
	const model = await getModelById(modelId);
	if (model.externalUserId !== userId) throw new ForbiddenError('无权限修改此模型');
	return modelRepository.update(modelId, data);
}

export async function publishModel(modelId: string, userId: string) {
	const model = await getModelById(modelId);
	if (model.externalUserId !== userId) throw new ForbiddenError('无权限发布此模型');
	if (!model.completedAt || !model.modelUrl)
		throw new InvalidStateError('模型尚未生成完成，无法发布');
	return modelRepository.updateVisibility(modelId, 'PUBLIC');
}

export async function unpublishModel(modelId: string, userId: string) {
	const model = await getModelById(modelId);
	if (model.externalUserId !== userId) throw new ForbiddenError('无权限操作此模型');
	return modelRepository.updateVisibility(modelId, 'PRIVATE');
}

/**
 * 更新模型可见性（统一接口）
 */
export async function updateModelVisibility(
	modelId: string,
	userId: string,
	visibility: 'PUBLIC' | 'PRIVATE',
) {
	const model = await getModelById(modelId);
	if (model.externalUserId !== userId) throw new ForbiddenError('无权限修改此模型');

	// 如果要设为公开，需要检查模型是否生成完成
	if (visibility === 'PUBLIC') {
		if (!model.completedAt || !model.modelUrl) {
			throw new InvalidStateError('模型尚未生成完成，无法发布');
		}
	}

	return modelRepository.updateVisibility(modelId, visibility);
}

/**
 * 从 S3 URL 提取 key
 * 支持多种 S3 URL 格式
 * @param url S3 完整 URL
 * @returns S3 key（如 models/xxx/model.obj 或 images/xxx/0.png）
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

export async function deleteModel(modelId: string, userId: string) {
	const model = await getModelById(modelId);
	if (model.externalUserId !== userId) throw new ForbiddenError('无权限删除此模型');

	// 删除模型相关的所有 S3 文件
	const fileUrls = [model.modelUrl, model.mtlUrl, model.textureUrl, model.previewImageUrl].filter(
		Boolean,
	) as string[];

	for (const url of fileUrls) {
		const key = extractS3KeyFromUrl(url);
		if (key) {
			try {
				await storageService.delete(key);
				logger.info({ msg: '✅ 已删除模型文件', modelId, key });
			} catch (error) {
				// 删除失败记录日志但不阻断流程（文件可能已被删除）
				logger.warn({
					msg: '⚠️ 删除模型文件失败',
					modelId,
					key,
					error,
				});
			}
		}
	}

	// 删除数据库记录
	await modelRepository.delete(modelId);

	logger.info({
		msg: '✅ 删除模型完成',
		modelId,
		deletedFiles: fileUrls.length,
	});
}

export async function incrementViewCount(modelId: string) {
	return modelRepository.incrementViewCount(modelId);
}

export async function incrementDownloadCount(modelId: string) {
	return modelRepository.incrementDownloadCount(modelId);
}
