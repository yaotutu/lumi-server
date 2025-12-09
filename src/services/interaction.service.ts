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
	await interactionRepository.create({ userId, modelId, type: 'LIKE' });
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
	await interactionRepository.create({ userId, modelId, type: 'FAVORITE' });
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
