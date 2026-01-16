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

import { getUserServiceClient } from '@/clients/user-service.client';
import config from '@/config/index';
import * as InteractionService from '@/services/interaction.service';
import * as ModelService from '@/services/model.service';
import type { UserInfoData } from '@/types/user-service.types';
import { ExternalAPIError, NotFoundError, UnauthenticatedError } from '@/utils/errors';
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
 * @throws {UnauthenticatedError} 认证失败
 * @throws {NotFoundError} 用户不存在
 * @throws {ExternalAPIError} 外部服务错误
 */
export async function getUserById(userId: string, authToken: string) {
	logger.debug({
		msg: '获取指定用户信息',
		userId,
	});

	// 初始化 UserServiceClient
	const userClient = getUserServiceClient({
		baseUrl: config.userService.url,
		timeout: 10000,
	});

	// 调用外部用户服务
	const response = await userClient.getUserById(userId, authToken);

	// ✅ 根据响应抛出自定义错误类（而非字符串匹配）
	if (response.code === 401 || response.code === 403) {
		logger.warn({
			msg: '❌ 获取用户信息失败：认证失败',
			userId,
			businessCode: response.code,
			businessMsg: response.msg,
		});
		throw new UnauthenticatedError('认证失败，请重新登录');
	}

	if (response.code === 404) {
		logger.warn({
			msg: '❌ 获取用户信息失败：用户不存在',
			userId,
			businessCode: response.code,
			businessMsg: response.msg,
		});
		throw new NotFoundError('用户不存在');
	}

	if (response.code !== 200) {
		logger.error({
			msg: '❌ 获取用户信息失败：外部服务错误',
			userId,
			businessCode: response.code,
			businessMsg: response.msg,
		});
		throw new ExternalAPIError(response.msg || '获取用户信息失败', 'UserService');
	}

	logger.info({
		msg: '✅ 获取指定用户信息成功',
		userId,
	});

	// response.data 已经在前面通过 code !== 200 的检查保证了存在性
	return response.data as UserInfoData;
}

/**
 * 更新用户信息（代理到外部用户服务）
 *
 * @param userId 用户 ID
 * @param updateData 更新数据（nick_name, avatar, gender）
 * @param authToken 认证 Token
 * @returns 成功消息
 * @throws {UnauthenticatedError} 认证失败
 * @throws {ValidationError} 参数验证失败
 * @throws {ExternalAPIError} 外部服务错误
 */
export async function updateUser(
	userId: string,
	updateData: {
		nick_name?: string;
		avatar?: string;
		gender?: string;
	},
	authToken: string,
) {
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

	// 调用外部用户服务
	const response = await userClient.updateUser(userId, updateData, authToken);

	// ✅ 根据响应抛出自定义错误类
	if (response.code === 401 || response.code === 403) {
		logger.warn({
			msg: '❌ 更新用户信息失败：认证失败',
			userId,
			businessCode: response.code,
			businessMsg: response.msg,
		});
		throw new UnauthenticatedError('认证失败，请重新登录');
	}

	if (response.code !== 200) {
		logger.error({
			msg: '❌ 更新用户信息失败：外部服务错误',
			userId,
			businessCode: response.code,
			businessMsg: response.msg,
		});
		throw new ExternalAPIError(response.msg || '更新用户信息失败', 'UserService');
	}

	logger.info({
		msg: '✅ 更新用户信息成功',
		userId,
	});

	return { message: response.msg || '更新成功' };
}

/**
 * 修改密码（代理到外部用户服务）
 *
 * @param userId 用户 ID
 * @param passwordData 密码数据（old_password, new_password, repassword, random_code）
 * @param authToken 认证 Token
 * @returns 成功消息
 * @throws {UnauthenticatedError} 认证失败
 * @throws {ValidationError} 参数验证失败
 * @throws {ExternalAPIError} 外部服务错误
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
) {
	logger.debug({
		msg: '修改密码',
		userId,
	});

	// 初始化 UserServiceClient
	const userClient = getUserServiceClient({
		baseUrl: config.userService.url,
		timeout: 10000,
	});

	// 调用外部用户服务
	const response = await userClient.modifyPassword(userId, passwordData, authToken);

	// ✅ 根据响应抛出自定义错误类
	if (response.code === 401 || response.code === 403) {
		logger.warn({
			msg: '❌ 修改密码失败：认证失败',
			userId,
			businessCode: response.code,
			businessMsg: response.msg,
		});
		throw new UnauthenticatedError('认证失败，请重新登录');
	}

	if (response.code !== 200) {
		logger.error({
			msg: '❌ 修改密码失败：外部服务错误',
			userId,
			businessCode: response.code,
			businessMsg: response.msg,
		});
		throw new ExternalAPIError(response.msg || '修改密码失败', 'UserService');
	}

	logger.info({
		msg: '✅ 修改密码成功',
		userId,
	});

	return { message: response.msg || '修改密码成功' };
}
