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

/**
 * 获取打印机列表（新版本 - 使用 Repository 层）
 *
 * 核心改进：
 * - 默认包含实时状态（一次请求获取完整信息）
 * - 统一数据格式（camelCase + ISO 8601 时间）
 * - 返回业务级数据，前端无需适配器
 *
 * @param userId 用户 ID（预留）
 * @param token 认证 Token
 * @param options 查询选项
 * @param options.page 页码（从 1 开始，默认 1）
 * @param options.size 每页数量（默认 10）
 * @param options.includeStatus 是否包含实时状态（默认 true）
 * @returns 打印机列表和分页信息
 *
 * @throws Error 当外部服务不可用时
 *
 * @example
 * ```typescript
 * // 获取第一页（默认包含实时状态）
 * const result = await DeviceService.getPrinterList('user-123', 'Bearer xxx', { page: 1, size: 10 });
 *
 * // 只获取基本信息（不包含实时状态）
 * const result = await DeviceService.getPrinterList('user-123', 'Bearer xxx', { page: 1, size: 10, includeStatus: false });
 * ```
 */
export async function getPrinterList(
	userId: string,
	token: string,
	options: {
		page?: number;
		size?: number;
		includeStatus?: boolean;
	} = {},
): Promise<{
	printers: import('@/repositories/printer.repository.js').Printer[];
	total: number;
	page: number;
	size: number;
}> {
	const { page = 1, size = 10, includeStatus = true } = options;

	logger.info({
		msg: '📥 收到获取打印机列表请求（新版本）',
		userId,
		page,
		size,
		includeStatus,
	});

	try {
		// 调用 Repository 层获取打印机列表
		const { printerRepository } = await import('@/repositories/printer.repository.js');
		const result = await printerRepository.getPrinterList(userId, token, {
			page,
			size,
			includeStatus,
		});

		logger.info({
			msg: '✅ 获取打印机列表成功（新版本）',
			total: result.total,
			count: result.printers.length,
			includeStatus,
		});

		return {
			...result,
			page,
			size,
		};
	} catch (error) {
		logger.error({
			msg: '❌ 获取打印机列表失败（新版本）',
			userId,
			page,
			size,
			error: error instanceof Error ? error.message : String(error),
		});

		throw error;
	}
}

/**
 * 获取单台打印机详情（新版本 - 使用 Repository 层）
 *
 * 核心改进：
 * - 返回完整信息（基本信息 + 实时状态 + 当前任务）
 * - 统一数据格式（camelCase + ISO 8601 时间）
 * - 前端无需适配器
 *
 * @param id 打印机 ID（device_name）
 * @param token 认证 Token
 * @returns 打印机完整信息
 *
 * @throws Error 当外部服务不可用或打印机不存在时
 *
 * @example
 * ```typescript
 * const printer = await DeviceService.getPrinter('R1-BS2HWR', 'Bearer xxx');
 * ```
 */
export async function getPrinter(
	id: string,
	token: string,
): Promise<import('@/repositories/printer.repository.js').Printer> {
	logger.info({
		msg: '📥 收到获取打印机详情请求（新版本）',
		id,
	});

	try {
		// 调用 Repository 层获取打印机详情
		const { printerRepository } = await import('@/repositories/printer.repository.js');
		const printer = await printerRepository.getPrinter(id, token);

		logger.info({
			msg: '✅ 获取打印机详情成功（新版本）',
			id,
			status: printer.status,
		});

		return printer;
	} catch (error) {
		logger.error({
			msg: '❌ 获取打印机详情失败（新版本）',
			id,
			error: error instanceof Error ? error.message : String(error),
		});

		throw error;
	}
}

/**
 * 批量获取打印机详情（新版本 - 使用 Repository 层）
 *
 * 核心改进：
 * - 一次请求获取多台打印机的完整信息
 * - 服务端内部并发调用外部服务
 * - 单个失败不影响整体
 *
 * @param ids 打印机 ID 列表
 * @param token 认证 Token
 * @returns 打印机列表（失败的会被过滤掉）
 *
 * @throws Error 当参数无效时
 *
 * @example
 * ```typescript
 * const printers = await DeviceService.batchGetPrinters(['id1', 'id2', 'id3'], 'Bearer xxx');
 * ```
 */
export async function batchGetPrinters(
	ids: string[],
	token: string,
): Promise<import('@/repositories/printer.repository.js').Printer[]> {
	// 参数校验
	if (ids.length === 0) {
		throw new Error('打印机 ID 列表不能为空');
	}
	if (ids.length > 20) {
		throw new Error('批量获取最多支持 20 台打印机');
	}

	logger.info({
		msg: '📥 收到批量获取打印机详情请求（新版本）',
		count: ids.length,
	});

	try {
		// 调用 Repository 层批量获取打印机详情
		const { printerRepository } = await import('@/repositories/printer.repository.js');
		const results = await printerRepository.batchGetPrinters(ids, token);

		// 过滤掉失败的（null）
		const printers = results.filter(
			(p) => p !== null,
		) as import('@/repositories/printer.repository.js').Printer[];

		logger.info({
			msg: '✅ 批量获取打印机详情成功（新版本）',
			requested: ids.length,
			succeeded: printers.length,
			failed: ids.length - printers.length,
		});

		return printers;
	} catch (error) {
		logger.error({
			msg: '❌ 批量获取打印机详情失败（新版本）',
			count: ids.length,
			error: error instanceof Error ? error.message : String(error),
		});

		throw error;
	}
}

/**
 * 获取打印机实时状态（新版本 - 使用 Repository 层）
 *
 * 核心改进：
 * - 只返回实时变化的数据（状态、温度、进度）
 * - 不返回基本信息（id、name、model 等）
 * - 专为轮询场景优化，节省带宽
 *
 * @param id 打印机 ID（device_name）
 * @param token 认证 Token
 * @returns 打印机实时状态
 *
 * @throws Error 当外部服务不可用或打印机不存在时
 *
 * @example
 * ```typescript
 * const status = await DeviceService.getPrinterStatus('R1-BS2HWR', 'Bearer xxx');
 * ```
 */
export async function getPrinterStatus(
	id: string,
	token: string,
): Promise<import('@/repositories/printer.repository.js').PrinterStatusData> {
	logger.info({
		msg: '📥 收到获取打印机实时状态请求（新版本）',
		id,
	});

	try {
		// 调用 Repository 层获取打印机实时状态
		const { printerRepository } = await import('@/repositories/printer.repository.js');
		const status = await printerRepository.getPrinterStatus(id, token);

		logger.info({
			msg: '✅ 获取打印机实时状态成功（新版本）',
			id,
			status: status.status,
		});

		return status;
	} catch (error) {
		logger.error({
			msg: '❌ 获取打印机实时状态失败（新版本）',
			id,
			error: error instanceof Error ? error.message : String(error),
		});

		throw error;
	}
}

/**
 * 获取打印机列表（旧版本 - 保留用于兼容）
 *
 * @deprecated 请使用新版本的 getPrinterList
 */
export async function getPrinterListLegacy(options: {
	page: number;
	size: number;
	token: string;
}): Promise<{ code: number; data: any[]; msg: string; total: number }> {
	const { page, size, token } = options;

	logger.info({
		msg: '📥 收到获取打印机列表请求（旧版本）',
		page,
		size,
	});

	// 初始化 Device 服务客户端
	const deviceClient = getDeviceServiceClient({
		baseUrl: config.deviceService.url,
		timeout: config.deviceService.timeout,
	});

	// 调用外部服务
	try {
		const result = await deviceClient.getPrinterList({ page, size }, token);

		logger.info({
			msg: '✅ 获取打印机列表成功（旧版本）',
			total: result.total,
			count: result.data.length,
		});

		return result;
	} catch (error) {
		logger.error({
			msg: '❌ 调用外部 Device 服务失败（获取打印机列表 - 旧版本）',
			page,
			size,
			error: error instanceof Error ? error.message : String(error),
		});

		throw error;
	}
}

/**
 * 获取打印机详情（旧版本 - 保留用于兼容）
 *
 * @deprecated 请使用新版本的 getPrinter
 */
export async function getPrinterDetailLegacy(
	deviceId: string,
	token: string,
): Promise<{ code: number; data: any; msg: string; status: any; task: any }> {
	logger.info({
		msg: '📥 收到获取打印机详情请求（旧版本）',
		deviceId,
	});

	// 初始化 Device 服务客户端
	const deviceClient = getDeviceServiceClient({
		baseUrl: config.deviceService.url,
		timeout: config.deviceService.timeout,
	});

	// 调用外部服务
	try {
		const result = await deviceClient.getPrinterDetail(deviceId, token);

		logger.info({
			msg: '✅ 获取打印机详情成功（旧版本）',
			deviceId,
		});

		return result;
	} catch (error) {
		logger.error({
			msg: '❌ 调用外部 Device 服务失败（获取打印机详情 - 旧版本）',
			deviceId,
			error: error instanceof Error ? error.message : String(error),
		});

		throw error;
	}
}

/**
 * 绑定打印机选项（新版本）
 */
export interface BindPrinterOptions {
	/** 设备名称（打印机上显示的名称） */
	deviceName: string;
	/** 绑定码（打印机上显示的验证码） */
	code: string;
	/** 认证 Token（必填，用于外部服务认证） */
	token: string;
}

/**
 * 绑定打印机（新版本）
 *
 * 核心改进：
 * - 使用 camelCase 参数命名
 * - 绑定成功后返回打印机完整信息
 *
 * @param options 绑定选项（deviceName, code, token 必填）
 * @returns 绑定后的打印机完整信息
 *
 * @throws Error 当外部服务不可用或绑定失败时
 *
 * @example
 * ```typescript
 * const printer = await DeviceService.bindPrinter({
 *   deviceName: 'R1-AX6FFI',
 *   code: 'FTD8CZ',
 *   token: 'Bearer xxx'
 * });
 * ```
 */
export async function bindPrinter(
	options: BindPrinterOptions,
): Promise<import('@/repositories/printer.repository.js').Printer> {
	const { deviceName, code, token } = options;

	logger.info({
		msg: '📥 收到绑定打印机请求（新版本）',
		deviceName,
	});

	// 初始化 Device 服务客户端
	const deviceClient = getDeviceServiceClient({
		baseUrl: config.deviceService.url,
		timeout: config.deviceService.timeout,
	});

	// 调用外部服务绑定打印机
	try {
		await deviceClient.bindPrinter({ device_name: deviceName, code }, token);

		logger.info({
			msg: '✅ 绑定打印机成功（新版本）',
			deviceName,
		});

		// 绑定成功后，获取打印机完整信息
		const printer = await getPrinter(deviceName, token);

		return printer;
	} catch (error) {
		logger.error({
			msg: '❌ 绑定打印机失败（新版本）',
			deviceName,
			error: error instanceof Error ? error.message : String(error),
		});

		throw error;
	}
}

/**
 * 解绑打印机选项（新版本）
 */
export interface UnbindPrinterOptions {
	/** 打印机 ID（device_id，如 "01KG6Y1E73FXAR394XMSSWQCMQ"） */
	deviceId: string;
	/** 认证 Token（必填，用于外部服务认证） */
	token: string;
}

/**
 * 解绑打印机（新版本）
 *
 * 核心改进：
 * - 使用 camelCase 参数命名
 * - 使用 deviceId（打印机 ID）而非 deviceName（设备名称）
 *
 * @param options 解绑选项（deviceId, token 必填）
 * @returns void
 *
 * @throws Error 当外部服务不可用或解绑失败时
 *
 * @example
 * ```typescript
 * await DeviceService.unbindPrinter({
 *   deviceId: '01KG6Y1E73FXAR394XMSSWQCMQ',
 *   token: 'Bearer xxx'
 * });
 * ```
 */
export async function unbindPrinter(options: UnbindPrinterOptions): Promise<void> {
	const { deviceId, token } = options;

	logger.info({
		msg: '📥 收到解绑打印机请求（新版本）',
		deviceId,
	});

	// 初始化 Device 服务客户端
	const deviceClient = getDeviceServiceClient({
		baseUrl: config.deviceService.url,
		timeout: config.deviceService.timeout,
	});

	// 调用外部服务
	// 外部服务需要的参数格式：{ device_id: "01KG6Y1E73FXAR394XMSSWQCMQ" }
	try {
		await deviceClient.unbindPrinter({ device_id: deviceId }, token);

		logger.info({
			msg: '✅ 解绑打印机成功（新版本）',
			deviceId,
		});
	} catch (error) {
		logger.error({
			msg: '❌ 解绑打印机失败（新版本）',
			deviceId,
			error: error instanceof Error ? error.message : String(error),
		});

		throw error;
	}
}

/**
 * 创建打印任务选项
 */
export interface CreatePrintTaskOptions {
	/** 用户 ID（从认证信息中获取） */
	userId: string;
	/** 打印机设备名称（前端传入） */
	deviceName: string;
	/** 文件名称 */
	fileName: string;
	/** G-code 文件 URL */
	gcodeUrl: string;
	/** 认证 Token（必填，用于外部服务认证） */
	token: string;
}

/**
 * 创建打印任务结果
 */
export interface CreatePrintTaskResult {
	/** 成功消息 */
	message: string;
}

/**
 * 创建打印任务
 *
 * @param options 创建选项（userId, deviceName, fileName, gcodeUrl, token 必填）
 * @returns 打印任务创建结果
 *
 * @throws Error 当外部服务不可用或创建失败时
 *
 * @example
 * ```typescript
 * const result = await DeviceService.createPrintTask({
 *   userId: 'user-123',
 *   deviceName: 'R1-BS2HWR',
 *   fileName: 'model.glb',
 *   gcodeUrl: 'https://s3.amazonaws.com/bucket/model.gcode',
 *   token: 'Bearer xxx'
 * });
 * ```
 */
export async function createPrintTask(
	options: CreatePrintTaskOptions,
): Promise<CreatePrintTaskResult> {
	const { userId, deviceName, fileName, gcodeUrl, token } = options;

	logger.info({
		msg: '📥 收到创建打印任务请求',
		userId,
		deviceName,
		fileName,
	});

	// 初始化 Device 服务客户端
	const deviceClient = getDeviceServiceClient({
		baseUrl: config.deviceService.url,
		timeout: config.deviceService.timeout,
	});

	// 调用外部服务
	try {
		// 调用 Client 层创建打印任务
		const response = await deviceClient.createPrintTask(
			{
				device_name: deviceName,
				file_name: fileName,
				gcode_url: gcodeUrl,
				user_id: userId,
			},
			token,
		);

		// 验证响应 code
		if (response.code === 200) {
			logger.info({
				msg: '✅ 创建打印任务成功',
				userId,
				deviceName,
				fileName,
			});

			return {
				message: '打印任务已创建',
			};
		}

		// 处理业务错误（code !== 200）
		if (response.code === 400) {
			logger.warn({
				msg: '⚠️ 创建打印任务失败：参数无效',
				userId,
				deviceName,
				fileName,
				responseMsg: response.msg,
			});

			throw new Error(`打印任务参数无效: ${response.msg}`);
		}

		// 其他未知错误
		logger.error({
			msg: '❌ 创建打印任务失败：未知错误',
			userId,
			deviceName,
			fileName,
			responseCode: response.code,
			responseMsg: response.msg,
		});

		throw new Error(`打印任务创建失败: ${response.msg}`);
	} catch (error) {
		logger.error({
			msg: '❌ 调用外部 Device 服务失败（创建打印任务）',
			userId,
			deviceName,
			fileName,
			error: error instanceof Error ? error.message : String(error),
		});

		// 重新抛出错误
		throw error;
	}
}
