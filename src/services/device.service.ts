/**
 * Device Service
 * Device 服务层
 *
 * 职责：
 * - 处理产品查询的业务逻辑
 * - 参数校验和默认值处理
 * - 外部服务响应格式转换为内部格式
 * - 错误处理和日志记录
 */

import { getDeviceServiceClient } from '@/clients/device';
import { config } from '@/config/index.js';
import type { ProductEntityType } from '@/schemas/entities/device.entity.schema.js';
import { logger } from '@/utils/logger.js';

/**
 * 查询产品列表选项
 */
export interface GetProductsOptions {
	/** 页码（从 0 开始，可选，默认 0） */
	page?: number;
	/** 每页数量（可选，默认 10） */
	size?: number;
	/** 搜索关键词（可选） */
	keyword?: string;
	/** 认证 Token（必填，用于外部服务认证） */
	token: string;
}

/**
 * 查询产品列表结果
 */
export interface GetProductsResult {
	/** 产品列表（使用从 Schema 自动推导的类型） */
	products: ProductEntityType[];
	/** 总记录数 */
	total: number;
}

/**
 * 查询产品列表
 *
 * @param options 查询选项（page, size, keyword 可选，token 必填）
 * @returns 产品列表和总数
 *
 * @throws Error 当外部服务不可用时
 *
 * @example
 * ```typescript
 * // 使用默认参数
 * const result = await DeviceService.getProducts({ token: 'Bearer xxx' });
 *
 * // 指定分页参数
 * const result = await DeviceService.getProducts({ page: 1, size: 20, token: 'Bearer xxx' });
 *
 * // 搜索特定关键词
 * const result = await DeviceService.getProducts({ keyword: 'printer', token: 'Bearer xxx' });
 * ```
 */
export async function getProducts(options: GetProductsOptions): Promise<GetProductsResult> {
	// 第 1 步：参数校验和默认值处理
	const page = options.page ?? 0; // 默认第 0 页
	const size = options.size ?? 10; // 默认每页 10 条
	const keyword = options.keyword; // 可选参数
	const token = options.token; // 必填参数

	logger.info({
		msg: '📥 收到查询产品列表请求',
		page,
		size,
		keyword,
	});

	// 第 2 步：初始化 Device 服务客户端
	const deviceClient = getDeviceServiceClient({
		baseUrl: config.deviceService.url,
		timeout: config.deviceService.timeout,
	});

	// 第 3 步：调用外部服务（Client 层已处理格式转换和错误验证）
	try {
		// Client 层返回的已经是转换后的格式：{ products: ProductEntityType[], total: number }
		// 不再需要验证 code、msg、data 字段
		const result = await deviceClient.getProducts(
			{
				page,
				size,
				keyword,
			},
			token, // 传递用户 Token
		);

		logger.info({
			msg: '✅ 查询产品列表成功',
			total: result.total,
			count: result.products.length,
		});

		// 直接返回（Client 层已完成格式转换）
		return result;
	} catch (error) {
		logger.error({
			msg: '❌ 调用外部 Device 服务失败',
			page,
			size,
			keyword,
			error: error instanceof Error ? error.message : String(error),
		});

		// 重新抛出错误（错误已经由 Client 中间层处理，转换为统一的错误类）
		throw error;
	}
}
