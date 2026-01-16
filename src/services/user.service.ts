/**
 * User Service - 用户业务逻辑层
 *
 * 职责：
 * - 统一封装用户相关的业务逻辑
 * - 协调 InteractionService、ModelService 等本地服务
 * - 调用外部用户服务（通过 UserServiceClient）
 * - 参数解析、验证、默认值设置
 * - 抛出自定义错误类（UnauthenticatedError、ValidationError 等）
 */

import { getUserServiceClient } from '@/clients/user';
import config from '@/config/index';
import * as InteractionService from '@/services/interaction.service';
import * as ModelService from '@/services/model.service';
import type { UserInfoData } from '@/types/user-service.types';
import { logger } from '@/utils/logger';

/**
 * 获取用户收藏的模型列表
 *
 * @param userId 用户 ID
 * @param options 查询选项（limit, offset）
 * @returns 模型列表
 */
export async function getUserFavoritedModels(
	userId: string,
	options?: {
		limit?: number;
		offset?: number;
	},
) {
	logger.debug({
		msg: '获取用户收藏列表',
		userId,
		limit: options?.limit,
		offset: options?.offset,
	});

	// 调用 InteractionService 获取收藏的模型
	const models = await InteractionService.getUserFavoritedModels(userId, options);

	logger.info({
		msg: '✅ 获取用户收藏列表成功',
		userId,
		modelCount: models.length,
	});

	return models;
}

/**
 * 获取用户点赞的模型列表
 *
 * @param userId 用户 ID
 * @param options 查询选项（limit, offset）
 * @returns 模型列表
 */
export async function getUserLikedModels(
	userId: string,
	options?: {
		limit?: number;
		offset?: number;
	},
) {
	logger.debug({
		msg: '获取用户点赞列表',
		userId,
		limit: options?.limit,
		offset: options?.offset,
	});

	// 调用 InteractionService 获取点赞的模型
	const models = await InteractionService.getUserLikedModels(userId, options);

	logger.info({
		msg: '✅ 获取用户点赞列表成功',
		userId,
		modelCount: models.length,
	});

	return models;
}

/**
 * 获取用户创建的模型列表
 *
 * @param userId 用户 ID
 * @param options 查询选项（visibility, sortBy, limit, offset）
 * @returns 模型列表
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
	// ✅ 在 Service 层设置默认值（Router 不应包含业务逻辑）
	const limit = options?.limit ?? 20;
	const offset = options?.offset ?? 0;
	const sortBy = options?.sortBy ?? 'latest';

	logger.debug({
		msg: '获取用户创建的模型列表',
		userId,
		visibility: options?.visibility,
		sortBy,
		limit,
		offset,
	});

	// 调用 ModelService 获取用户创建的模型
	const models = await ModelService.getUserModels(userId, {
		visibility: options?.visibility,
		sortBy,
		limit,
		offset,
	});

	logger.info({
		msg: '✅ 获取用户创建的模型列表成功',
		userId,
		modelCount: models.length,
	});

	return models;
}

/**
 * 获取指定用户信息（代理到外部用户服务）
 *
 * @param userId 用户 ID
 * @param authToken 认证 Token
 * @returns 用户信息
 * @throws {UnauthenticatedError} 认证失败（由 Client 中间层抛出）
 * @throws {ExternalAPIError} 外部服务错误（由 Client 中间层抛出）
 */
export async function getUserById(userId: string, authToken: string): Promise<UserInfoData> {
	logger.debug({
		msg: '获取指定用户信息',
		userId,
	});

	// 初始化 UserServiceClient
	const userClient = getUserServiceClient({
		baseUrl: config.userService.url,
		timeout: 10000,
	});

	// 调用外部用户服务（Client 中间层已处理错误验证和解包）
	// 不再需要手动验证 code 字段
	// 错误会由 Client 中间层自动转换为 UnauthenticatedError 或 ExternalAPIError
	const userInfo = await userClient.getUserById(userId, authToken);

	logger.info({
		msg: '✅ 获取指定用户信息成功',
		userId,
	});

	return userInfo;
}

/**
 * 更新用户信息（代理到外部用户服务）
 *
 * @param userId 用户 ID
 * @param updateData 更新数据（nick_name, avatar, gender）
 * @param authToken 认证 Token
 * @returns 成功消息
 * @throws {UnauthenticatedError} 认证失败（由 Client 中间层抛出）
 * @throws {ExternalAPIError} 外部服务错误（由 Client 中间层抛出）
 */
export async function updateUser(
	userId: string,
	updateData: {
		nick_name?: string;
		avatar?: string;
		gender?: string;
	},
	authToken: string,
): Promise<{ message: string }> {
	logger.debug({
		msg: '更新用户信息',
		userId,
		updateData,
	});

	// 初始化 UserServiceClient
	const userClient = getUserServiceClient({
		baseUrl: config.userService.url,
		timeout: 10000,
	});

	// 调用外部用户服务（Client 中间层已处理错误验证）
	// 返回 { message: string }
	const result = await userClient.updateUser(userId, updateData, authToken);

	logger.info({
		msg: '✅ 更新用户信息成功',
		userId,
	});

	return result;
}

/**
 * 修改密码（代理到外部用户服务）
 *
 * @param userId 用户 ID
 * @param passwordData 密码数据（old_password, new_password, repassword, random_code）
 * @param authToken 认证 Token
 * @returns 成功消息
 * @throws {UnauthenticatedError} 认证失败（由 Client 中间层抛出）
 * @throws {ExternalAPIError} 外部服务错误（由 Client 中间层抛出）
 */
export async function modifyPassword(
	userId: string,
	passwordData: {
		old_password?: string;
		new_password: string;
		repassword: string;
		random_code: string;
	},
	authToken: string,
): Promise<{ message: string }> {
	logger.debug({
		msg: '修改密码',
		userId,
	});

	// 初始化 UserServiceClient
	const userClient = getUserServiceClient({
		baseUrl: config.userService.url,
		timeout: 10000,
	});

	// 调用外部用户服务（Client 中间层已处理错误验证）
	// 返回 { message: string }
	const result = await userClient.modifyPassword(userId, passwordData, authToken);

	logger.info({
		msg: '✅ 修改密码成功',
		userId,
	});

	return result;
}
