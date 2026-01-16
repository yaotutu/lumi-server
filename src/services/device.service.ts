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

import { getDeviceServiceClient } from '@/clients/device-service.client.js';
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

	// 第 3 步：调用外部服务
	let response: Awaited<ReturnType<typeof deviceClient.getProducts>>;

	try {
		response = await deviceClient.getProducts(
			{
				page,
				size,
				keyword,
			},
			token, // 传递用户 Token
		);
	} catch (error) {
		logger.error({
			msg: '❌ 调用外部 Device 服务失败',
			page,
			size,
			keyword,
			error: error instanceof Error ? error.message : String(error),
		});
		throw new Error('Device 服务暂时不可用，请稍后重试');
	}

	// 检查外部服务响应码
	if (response.code !== 200) {
		logger.error({
			msg: '❌ Device 服务返回错误',
			code: response.code,
			message: response.msg,
		});

		// 特殊处理认证错误
		if (response.code === 401) {
			throw new Error('Device 服务认证失败，请检查配置');
		}

		throw new Error(`Device 服务错误: ${response.msg}`);
	}

	// 检查 data 字段是否存在
	if (!response.data || !Array.isArray(response.data)) {
		logger.error({
			msg: '❌ Device 服务响应格式错误',
			response,
		});
		throw new Error('Device 服务响应格式错误');
	}

	logger.info({
		msg: '✅ 查询产品列表成功',
		total: response.total,
		count: response.data.length,
	});

	// 第 4 步：格式转换（外部格式 → 内部格式）
	// - snake_case → camelCase
	// - Unix 时间戳（秒）→ ISO 8601 字符串
	const products = response.data.map((product) => ({
		id: product.id,
		productId: product.product_id,
		name: product.name,
		description: product.description,
		image: product.image,
		isActive: product.is_active,
		createdAt: new Date(product.created_at * 1000).toISOString(),
		createdBy: product.created_by,
		updatedAt: new Date(product.updated_at * 1000).toISOString(),
		updatedBy: product.updated_by,
		deletedAt: product.deleted_at ? new Date(product.deleted_at * 1000).toISOString() : null,
		deletedBy: product.deleted_by || null,
	}));

	return {
		products,
		total: response.total,
	};
}
