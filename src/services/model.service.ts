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
import { createId } from '@paralleldrive/cuid2';

export async function getModelById(modelId: string) {
	const model = await modelRepository.findById(modelId);
	if (!model) throw new NotFoundError(`模型不存在: ${modelId}`);
	return model;
}

export async function getUserModels(userId: string, options?: { limit?: number; offset?: number }) {
	return modelRepository.findByUserId(userId, options);
}

export async function getPublicModels(options?: {
	limit?: number;
	offset?: number;
	sortBy?: 'latest' | 'popular' | 'liked';
}) {
	const { limit = 20, offset = 0 } = options || {};

	// 获取模型列表（包含用户信息）
	const items = await modelRepository.findPublicModels(options);

	// 获取总数
	const total = await modelRepository.countPublicModels();

	// 计算是否还有更多
	const hasMore = offset + items.length < total;

	return {
		items,
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
	const modelName = `${request.prompt.substring(0, 20)}_model`;
	await generationRequestRepository.update(requestId, { selectedImageIndex: imageIndex });

	// 创建 Model 记录（默认为 PUBLIC）
	const modelId = createId();
	const model = await modelRepository.create({
		id: modelId,
		userId: request.userId,
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
	if (model.userId !== userId) throw new ForbiddenError('无权限修改此模型');
	return modelRepository.update(modelId, data);
}

export async function publishModel(modelId: string, userId: string) {
	const model = await getModelById(modelId);
	if (model.userId !== userId) throw new ForbiddenError('无权限发布此模型');
	if (!model.completedAt || !model.modelUrl)
		throw new InvalidStateError('模型尚未生成完成，无法发布');
	return modelRepository.updateVisibility(modelId, 'PUBLIC');
}

export async function unpublishModel(modelId: string, userId: string) {
	const model = await getModelById(modelId);
	if (model.userId !== userId) throw new ForbiddenError('无权限操作此模型');
	return modelRepository.updateVisibility(modelId, 'PRIVATE');
}

export async function deleteModel(modelId: string, userId: string) {
	const model = await getModelById(modelId);
	if (model.userId !== userId) throw new ForbiddenError('无权限删除此模型');
	await modelRepository.delete(modelId);
}

export async function incrementViewCount(modelId: string) {
	return modelRepository.incrementViewCount(modelId);
}

export async function incrementDownloadCount(modelId: string) {
	return modelRepository.incrementDownloadCount(modelId);
}
