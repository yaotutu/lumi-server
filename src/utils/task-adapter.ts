/**
 * 任务数据适配器 - 照搬 Next.js 的 task-adapter-client.ts 逻辑
 *
 * 职责：将后端的 GenerationRequest 数据转换为前端期望的格式
 */

/**
 * 将 GenerationRequest 适配为前端期望的格式
 */
export function adaptGenerationRequest(request: any): any {
	// 直接使用后端的 status 和 phase
	const status =
		request.status || deriveStatusFromPhase(request.phase, request.images, request.model);

	// 适配 images 字段：将 imageUrl 映射为 url（向后兼容）
	const adaptedImages = request.images.map((img: any) => ({
		...img,
		url: img.imageUrl, // 添加兼容字段
	}));

	// 适配 model 字段（1:1 关系）
	let adaptedModels: any[] = [];
	let modelGenerationStartedAt: Date | null = null;

	if (request.model) {
		const model = request.model;

		// 根据 completedAt 和 failedAt 推导状态
		let generationStatus: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
		let progress: number;

		if (model.completedAt) {
			generationStatus = 'COMPLETED';
			progress = 100;
		} else if (model.failedAt) {
			generationStatus = 'FAILED';
			progress = 0;
		} else if (model.generationJob) {
			// 使用 Job 的状态和进度
			const jobStatus = model.generationJob.status;
			progress = model.generationJob.progress || 0;

			if (jobStatus === 'COMPLETED') {
				generationStatus = 'COMPLETED';
				progress = 100;
			} else if (jobStatus === 'FAILED' || jobStatus === 'TIMEOUT') {
				generationStatus = 'FAILED';
			} else if (jobStatus === 'RUNNING' || jobStatus === 'RETRYING') {
				generationStatus = 'GENERATING';
			} else {
				generationStatus = 'PENDING';
			}
		} else {
			generationStatus = 'PENDING';
			progress = 0;
		}

		// 适配后的模型数据（包含状态字段）
		const adaptedModel = {
			...model,
			generationStatus,
			progress,
		};

		adaptedModels = [adaptedModel];

		modelGenerationStartedAt =
			model.createdAt instanceof Date ? model.createdAt : new Date(model.createdAt);
	}

	return {
		...request,
		images: adaptedImages,
		status,
		selectedImageIndex: request.selectedImageIndex ?? null,
		modelGenerationStartedAt,
		// 新架构：只保留 model 字段（1:1 关系）
		model: adaptedModels.length > 0 ? adaptedModels[0] : null,
	};
}

/**
 * 从 phase 和数据推导 status（当后端 status 字段为空时）
 */
function deriveStatusFromPhase(
	phase: string | null | undefined,
	images: any[],
	model: any,
): string {
	// 如果有明确的 phase，基于 phase 推导
	if (phase) {
		switch (phase) {
			case 'IMAGE_GENERATION': {
				// 检查图片状态
				if (images.length === 0) return 'IMAGE_PENDING';
				const anyImageGenerating = images.some((img) => img.imageStatus === 'GENERATING');
				const anyImageFailed = images.some((img) => img.imageStatus === 'FAILED');
				if (anyImageFailed) return 'IMAGE_FAILED';
				if (anyImageGenerating) return 'IMAGE_GENERATING';
				return 'IMAGE_PENDING';
			}

			case 'AWAITING_SELECTION':
				return 'IMAGE_COMPLETED';

			case 'MODEL_GENERATION':
				if (!model) return 'MODEL_PENDING';
				if (model.completedAt) return 'MODEL_COMPLETED';
				if (model.failedAt) return 'MODEL_FAILED';
				return 'MODEL_GENERATING';

			case 'COMPLETED':
				return 'COMPLETED';
		}
	}

	// 默认：基于数据推导
	if (images.length === 0) return 'IMAGE_PENDING';

	const allImagesCompleted = images.every((img) => img.imageStatus === 'COMPLETED');
	const anyImageFailed = images.some((img) => img.imageStatus === 'FAILED');

	if (anyImageFailed) return 'IMAGE_FAILED';

	if (model) {
		if (model.completedAt) return 'COMPLETED';
		if (model.failedAt) return 'MODEL_FAILED';
		return 'MODEL_GENERATING';
	}

	if (allImagesCompleted) return 'IMAGE_COMPLETED';

	return 'IMAGE_GENERATING';
}
