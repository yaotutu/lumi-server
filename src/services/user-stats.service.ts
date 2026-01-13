import { generationRequestRepository } from '@/repositories/generation-request.repository';
import { interactionRepository } from '@/repositories/interaction.repository';
import { modelRepository } from '@/repositories/model.repository';

/**
 * 用户统计数据接口
 * 定义返回给前端的统计信息结构
 */
export interface UserStats {
	// 模型统计
	totalModels: number; // 总模型数
	publicModels: number; // 公开模型数
	privateModels: number; // 私有模型数

	// 获得的交互统计（用户模型被他人的互动）
	totalLikes: number; // 获得的总点赞数
	totalFavorites: number; // 获得的总收藏数
	totalViews: number; // 获得的总浏览数
	totalDownloads: number; // 总下载数

	// 用户发出的交互
	likedModelsCount: number; // 用户点赞的模型数
	favoritedModelsCount: number; // 用户收藏的模型数

	// 生成请求统计
	totalRequests: number; // 总生成请求数
	completedRequests: number; // 已完成的请求数
	failedRequests: number; // 失败的请求数
}

/**
 * 获取用户的完整统计数据
 * 并行查询所有统计数据以提升性能
 * @param userId 用户外部 ID
 * @returns 用户统计数据对象
 */
export async function getUserStats(userId: string): Promise<UserStats> {
	// 使用 Promise.all 并行查询所有统计数据，提升查询性能
	// 避免串行查询导致的延迟累加
	const [
		totalModels, // 总模型数
		publicModels, // 公开模型数
		privateModels, // 私有模型数
		aggregateStats, // 聚合统计数据（点赞、收藏、浏览、下载）
		likedModelsCount, // 用户点赞的模型数
		favoritedModelsCount, // 用户收藏的模型数
		requestStats, // 生成请求统计（总数、完成数、失败数）
	] = await Promise.all([
		// 查询用户所有模型数量
		modelRepository.countByUserId(userId),
		// 查询用户公开模型数量
		modelRepository.countByUserId(userId, { visibility: 'PUBLIC' }),
		// 查询用户私有模型数量
		modelRepository.countByUserId(userId, { visibility: 'PRIVATE' }),
		// 查询用户模型的聚合统计数据
		modelRepository.getUserModelsAggregateStats(userId),
		// 查询用户点赞的模型数量
		interactionRepository.countUserLikes(userId),
		// 查询用户收藏的模型数量
		interactionRepository.countUserFavorites(userId),
		// 查询用户的生成请求统计
		generationRequestRepository.countUserRequestsByStatus(userId),
	]);

	// 组装并返回完整的统计数据
	return {
		// 模型统计
		totalModels,
		publicModels,
		privateModels,

		// 获得的交互统计
		totalLikes: aggregateStats.totalLikes,
		totalFavorites: aggregateStats.totalFavorites,
		totalViews: aggregateStats.totalViews,
		totalDownloads: aggregateStats.totalDownloads,

		// 用户发出的交互
		likedModelsCount,
		favoritedModelsCount,

		// 生成请求统计
		totalRequests: requestStats.total,
		completedRequests: requestStats.completed,
		failedRequests: requestStats.failed,
	};
}
