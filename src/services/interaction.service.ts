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
 * @returns 交互状态映射 { modelId: ['LIKE'] | ['FAVORITE'] | ['LIKE', 'FAVORITE'] | [] }
 */
export async function getBatchInteractions(
	userId: string,
	modelIds: string[],
): Promise<Record<string, string[]>> {
	// 初始化结果对象，所有模型默认为空数组
	const result: Record<string, string[]> = {};
	for (const modelId of modelIds) {
		result[modelId] = [];
	}

	// 批量查询交互记录
	const interactions = await interactionRepository.findBatchInteractions(userId, modelIds);

	// 填充交互状态
	for (const interaction of interactions) {
		if (!result[interaction.modelId]) {
			result[interaction.modelId] = [];
		}
		result[interaction.modelId].push(interaction.type);
	}

	return result;
}
