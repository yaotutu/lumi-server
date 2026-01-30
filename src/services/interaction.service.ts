/**
 * Interaction 服务层
 */
import { interactionRepository, modelRepository } from '@/repositories';
import { NotFoundError } from '@/utils/errors';

export async function toggleLike(
	userId: string,
	modelId: string,
): Promise<{ liked: boolean; likeCount: number }> {
	const model = await modelRepository.findById(modelId);
	if (!model) throw new NotFoundError(`模型不存在: ${modelId}`);
	const hasLiked = await interactionRepository.hasLiked(userId, modelId);
	if (hasLiked) {
		await interactionRepository.delete(userId, modelId, 'LIKE');
		await modelRepository.decrementLikeCount(modelId);
		const updatedModel = await modelRepository.findById(modelId);
		return { liked: false, likeCount: updatedModel?.likeCount || 0 };
	}
	await interactionRepository.create({ externalUserId: userId, modelId, type: 'LIKE' });
	await modelRepository.incrementLikeCount(modelId);
	const updatedModel = await modelRepository.findById(modelId);
	return { liked: true, likeCount: updatedModel?.likeCount || 0 };
}

export async function toggleFavorite(
	userId: string,
	modelId: string,
): Promise<{ favorited: boolean; favoriteCount: number }> {
	const model = await modelRepository.findById(modelId);
	if (!model) throw new NotFoundError(`模型不存在: ${modelId}`);
	const hasFavorited = await interactionRepository.hasFavorited(userId, modelId);
	if (hasFavorited) {
		await interactionRepository.delete(userId, modelId, 'FAVORITE');
		await modelRepository.decrementFavoriteCount(modelId);
		const updatedModel = await modelRepository.findById(modelId);
		return { favorited: false, favoriteCount: updatedModel?.favoriteCount || 0 };
	}
	await interactionRepository.create({ externalUserId: userId, modelId, type: 'FAVORITE' });
	await modelRepository.incrementFavoriteCount(modelId);
	const updatedModel = await modelRepository.findById(modelId);
	return { favorited: true, favoriteCount: updatedModel?.favoriteCount || 0 };
}

export async function getUserInteractionStatus(
	userId: string,
	modelId: string,
): Promise<{ liked: boolean; favorited: boolean }> {
	const [liked, favorited] = await Promise.all([
		interactionRepository.hasLiked(userId, modelId),
		interactionRepository.hasFavorited(userId, modelId),
	]);
	return { liked, favorited };
}

export async function getUserLikedModels(
	userId: string,
	options?: { limit?: number; offset?: number },
) {
	const interactions = await interactionRepository.findUserLikes(userId, options);
	const modelIds = interactions.map((i) => i.modelId);
	if (modelIds.length === 0) return [];
	return modelRepository.findByIds(modelIds);
}

export async function getUserFavoritedModels(
	userId: string,
	options?: { limit?: number; offset?: number },
) {
	const interactions = await interactionRepository.findUserFavorites(userId, options);
	const modelIds = interactions.map((i) => i.modelId);
	if (modelIds.length === 0) return [];
	return modelRepository.findByIds(modelIds);
}

/**
 * 批量获取用户对多个模型的交互状态
 *
 * @param userId 用户ID
 * @param modelIds 模型ID数组
 * @returns 交互状态映射 { modelId: { isLiked: boolean, isFavorited: boolean } }
 */
export async function getBatchInteractions(
	userId: string,
	modelIds: string[],
): Promise<Record<string, { isLiked: boolean; isFavorited: boolean }>> {
	// 定义返回类型
	type InteractionStatus = { isLiked: boolean; isFavorited: boolean };

	// 初始化结果对象，所有模型默认为未交互状态
	const result: Record<string, InteractionStatus> = {};
	for (const modelId of modelIds) {
		result[modelId] = {
			isLiked: false,
			isFavorited: false,
		};
	}

	// 批量查询交互记录
	const interactions = await interactionRepository.findBatchInteractions(userId, modelIds);

	// 填充交互状态（将数组转换为对象）
	for (const interaction of interactions) {
		if (!result[interaction.modelId]) {
			result[interaction.modelId] = {
				isLiked: false,
				isFavorited: false,
			};
		}

		// 根据交互类型设置对应字段
		if (interaction.type === 'LIKE') {
			result[interaction.modelId].isLiked = true;
		} else if (interaction.type === 'FAVORITE') {
			result[interaction.modelId].isFavorited = true;
		}
	}

	return result;
}

/**
 * 统一的交互切换方法
 * 处理点赞或收藏操作，并返回完整的计数信息
 *
 * @param userId 用户 ID
 * @param modelId 模型 ID
 * @param type 交互类型（LIKE 或 FAVORITE）
 * @returns 交互结果，包含是否交互、类型、点赞数、收藏数
 */
export async function toggleInteraction(
	userId: string,
	modelId: string,
	type: 'LIKE' | 'FAVORITE',
): Promise<{
	isInteracted: boolean;
	type: string;
	likeCount: number;
	favoriteCount: number;
}> {
	// 👇 从 Router 搬运的逻辑（原封不动）
	let isInteracted: boolean;
	let likeCount: number;
	let favoriteCount: number;

	if (type === 'LIKE') {
		const result = await toggleLike(userId, modelId);
		isInteracted = result.liked;
		likeCount = result.likeCount;
		// 获取最新的 favoriteCount
		const modelData = await modelRepository.findById(modelId);
		favoriteCount = modelData?.favoriteCount || 0;
	} else {
		const result = await toggleFavorite(userId, modelId);
		isInteracted = result.favorited;
		favoriteCount = result.favoriteCount;
		// 获取最新的 likeCount
		const modelData = await modelRepository.findById(modelId);
		likeCount = modelData?.likeCount || 0;
	}

	return {
		isInteracted,
		type,
		likeCount,
		favoriteCount,
	};
}
