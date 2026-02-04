/**
 * Printer Repository
 * 打印机数据访问层
 *
 * 职责：
 * - 封装外部 Device 服务调用
 * - 实现数据聚合逻辑（列表 + 详情）
 * - 实现批量并发请求
 * - 统一数据转换（snake_case → camelCase）
 * - 统一时间格式转换（Unix 时间戳 → ISO 8601）
 */

import { getDeviceServiceClient } from '@/clients/device/device-service.client.js';
import { config } from '@/config/index.js';
import { logger } from '@/utils/logger.js';

// ============================================
// 类型定义
// ============================================

/**
 * 打印机状态枚举
 */
export enum PrinterStatus {
	/** 离线 */
	OFFLINE = 'OFFLINE',
	/** 在线 */
	ONLINE = 'ONLINE',
	/** 打印中 */
	PRINTING = 'PRINTING',
	/** 暂停 */
	PAUSED = 'PAUSED',
	/** 错误 */
	ERROR = 'ERROR',
}

/**
 * 温度信息接口
 */
export interface Temperature {
	/** 当前温度 */
	current: number;
	/** 目标温度 */
	target: number;
}

/**
 * 位置信息接口
 */
export interface Position {
	/** X 轴位置 */
	x: number;
	/** Y 轴位置 */
	y: number;
	/** Z 轴位置 */
	z: number;
}

/**
 * 打印机实时状态接口
 */
export interface PrinterRealtimeStatus {
	/** 喷嘴温度 */
	nozzleTemperature: Temperature;
	/** 热床温度 */
	bedTemperature: Temperature;
	/** 内部温度 */
	innerTemperature: number;
	/** 位置信息 */
	position: Position;
	/** 风扇是否开启 */
	fanEnabled: boolean;
	/** LED 是否开启 */
	ledEnabled: boolean;
}

/**
 * 当前打印任务接口
 */
export interface CurrentJob {
	/** 任务名称 */
	name: string;
	/** 打印进度（0-100） */
	progress: number;
	/** 剩余时间（秒） */
	timeRemaining: number;
	/** 开始时间（ISO 8601 字符串） */
	startedAt: string;
}

/**
 * 打印机完整信息接口
 */
export interface Printer {
	/** 打印机 ID */
	id: string;
	/** 打印机名称 */
	name: string;
	/** 设备名称 */
	deviceName: string;
	/** 打印机型号 */
	model: string;
	/** 打印机状态 */
	status: PrinterStatus;
	/** 最后在线时间（ISO 8601 字符串，null 表示从未在线） */
	lastOnline: string | null;
	/** 固件版本 */
	firmwareVersion?: string;
	/** 实时状态（可能为 null） */
	realtimeStatus: PrinterRealtimeStatus | null;
	/** 当前打印任务（可能为 null） */
	currentJob: CurrentJob | null;
}

/**
 * 打印机实时状态（用于轮询）
 */
export interface PrinterStatusData {
	/** 打印机状态 */
	status: PrinterStatus;
	/** 实时状态 */
	realtimeStatus: PrinterRealtimeStatus;
	/** 当前打印任务（可能为 null） */
	currentJob: CurrentJob | null;
	/** 更新时间（ISO 8601 字符串） */
	updatedAt: string;
}

// ============================================
// 辅助函数
// ============================================

/**
 * 映射打印机状态
 *
 * 外部服务状态映射规则：
 * - status: 0=离线, 1=在线
 * - task: 有值=有任务（打印中）, null=空闲（idle）
 *
 * @param status 外部服务的 status 字段（0=离线, 1=在线）
 * @param task 外部服务的 task 字段（有值=有任务, null=空闲）
 * @returns 打印机状态枚举
 */
function mapPrinterStatus(status: number, task?: any): PrinterStatus {
	// 如果离线，直接返回 OFFLINE
	if (status === 0) {
		return PrinterStatus.OFFLINE;
	}

	// 如果在线且有任务，返回 PRINTING
	if (status === 1 && task) {
		return PrinterStatus.PRINTING;
	}

	// 在线且空闲，返回 ONLINE
	return PrinterStatus.ONLINE;
}

/**
 * 转换打印机基本信息（不包含实时状态）
 *
 * @param data 外部服务返回的打印机数据
 * @returns 转换后的打印机基本信息
 */
function transformBasicPrinterData(data: any): Printer {
	return {
		id: data.id,
		name: data.name || data.device_name,
		deviceName: data.device_name,
		model: data.product_name,
		status: mapPrinterStatus(data.status, null), // 基本信息没有 task，传 null
		lastOnline:
			data.last_online_time > 0 ? new Date(data.last_online_time * 1000).toISOString() : null,
		firmwareVersion: data.firmware_version,
		realtimeStatus: null,
		currentJob: null,
	};
}

/**
 * 转换打印机完整信息（包含实时状态）
 *
 * @param data 外部服务返回的打印机基本数据
 * @param status 外部服务返回的实时状态数据（可选）
 * @param task 外部服务返回的任务数据（可选）
 * @returns 转换后的打印机完整信息
 */
function transformPrinterData(data: any, status?: any, task?: any): Printer {
	return {
		id: data.id,
		name: data.name || data.device_name,
		deviceName: data.device_name,
		model: data.product_name,
		status: mapPrinterStatus(data.status, task), // 使用 task 判断状态
		lastOnline:
			data.last_online_time > 0 ? new Date(data.last_online_time * 1000).toISOString() : null,
		firmwareVersion: data.firmware_version,
		realtimeStatus: status
			? {
					nozzleTemperature: {
						current: status.nozzle_temperature.temperature,
						target: status.nozzle_temperature.target,
					},
					bedTemperature: {
						current: status.bed_temperature.temperature,
						target: status.bed_temperature.target,
					},
					innerTemperature: status.inner_temperature,
					position: {
						x: Number.parseFloat(status.position[0]),
						y: Number.parseFloat(status.position[1]),
						z: Number.parseFloat(status.position[2]),
					},
					fanEnabled: status.fan,
					ledEnabled: status.led,
				}
			: null,
		currentJob: task
			? {
					name: task.name,
					progress: task.progress || 0,
					timeRemaining: task.time_remaining || 0,
					startedAt: task.started_at
						? new Date(task.started_at * 1000).toISOString()
						: new Date().toISOString(),
				}
			: null,
	};
}

/**
 * 转换打印机实时状态（用于轮询）
 *
 * @param status 外部服务返回的实时状态数据
 * @param task 外部服务返回的任务数据（可选）
 * @returns 转换后的打印机实时状态
 */
function transformPrinterStatus(status: any, task?: any): PrinterStatusData {
	return {
		status: mapPrinterStatus(1, task), // 使用 task 判断状态
		realtimeStatus: {
			nozzleTemperature: {
				current: status.nozzle_temperature.temperature,
				target: status.nozzle_temperature.target,
			},
			bedTemperature: {
				current: status.bed_temperature.temperature,
				target: status.bed_temperature.target,
			},
			innerTemperature: status.inner_temperature,
			position: {
				x: Number.parseFloat(status.position[0]),
				y: Number.parseFloat(status.position[1]),
				z: Number.parseFloat(status.position[2]),
			},
			fanEnabled: status.fan,
			ledEnabled: status.led,
		},
		currentJob: task
			? {
					name: task.name,
					progress: task.progress || 0,
					timeRemaining: task.time_remaining || 0,
					startedAt: task.started_at
						? new Date(task.started_at * 1000).toISOString()
						: new Date().toISOString(),
				}
			: null,
		updatedAt: new Date().toISOString(),
	};
}

// ============================================
// Repository 类
// ============================================

/**
 * Printer Repository 类
 *
 * 提供打印机数据访问的所有方法
 */
export class PrinterRepository {
	/**
	 * 获取打印机列表（默认包含实时状态）
	 *
	 * 核心逻辑：
	 * 1. 调用外部服务获取打印机列表（基本信息）
	 * 2. 如果 includeStatus=true，并发获取每台打印机的详情（实时状态）
	 * 3. 合并数据并转换格式
	 *
	 * @param userId 用户 ID（暂未使用，预留）
	 * @param token 认证 Token
	 * @param options 查询选项
	 * @param options.page 页码（从 1 开始）
	 * @param options.size 每页数量
	 * @param options.includeStatus 是否包含实时状态（默认 true）
	 * @returns 打印机列表和总数
	 */
	async getPrinterList(
		userId: string,
		token: string,
		options: {
			page?: number;
			size?: number;
			includeStatus?: boolean;
		} = {},
	): Promise<{ printers: Printer[]; total: number }> {
		const { page = 1, size = 10, includeStatus = true } = options;

		// 获取 Device 服务客户端（传递配置）
		const client = getDeviceServiceClient({
			baseUrl: config.deviceService.url,
			timeout: config.deviceService.timeout,
		});

		// 第 1 步：调用外部服务获取打印机列表（基本信息）
		const listResponse = await client.getPrinterList({ page, size }, token);

		// 如果不需要实时状态，直接返回基本信息
		if (!includeStatus) {
			const printers = listResponse.data.map(transformBasicPrinterData);
			return { printers, total: listResponse.total };
		}

		// 第 2 步：并发获取每台打印机的详情（实时状态）
		const detailPromises = listResponse.data.map((printer) =>
			client.getPrinterDetail(printer.device_name, token).catch((error) => {
				// 单个打印机详情获取失败不影响整体
				logger.warn({
					msg: `获取打印机 ${printer.device_name} 详情失败`,
					error: error.message,
				});
				return null;
			}),
		);

		// 等待所有详情请求完成
		const details = await Promise.all(detailPromises);

		// 第 3 步：合并数据并转换格式
		const printers = listResponse.data.map((printer, index) => {
			const detail = details[index];
			return transformPrinterData(printer, detail?.status, detail?.task);
		});

		return { printers, total: listResponse.total };
	}

	/**
	 * 获取单台打印机详情
	 *
	 * @param id 打印机 ID（device_name）
	 * @param token 认证 Token
	 * @returns 打印机完整信息
	 */
	async getPrinter(id: string, token: string): Promise<Printer> {
		// 获取 Device 服务客户端（传递配置）
		const client = getDeviceServiceClient({
			baseUrl: config.deviceService.url,
			timeout: config.deviceService.timeout,
		});

		// 调用外部服务获取打印机详情
		const response = await client.getPrinterDetail(id, token);

		// 转换数据格式
		return transformPrinterData(response.data, response.status, response.task);
	}

	/**
	 * 批量获取打印机详情
	 *
	 * 核心逻辑：
	 * 1. 并发调用外部服务获取每台打印机的详情
	 * 2. 单个失败不影响整体（返回 null，前端过滤）
	 * 3. 转换数据格式
	 *
	 * @param ids 打印机 ID 列表
	 * @param token 认证 Token
	 * @returns 打印机列表（失败的返回 null）
	 */
	async batchGetPrinters(ids: string[], token: string): Promise<(Printer | null)[]> {
		// 获取 Device 服务客户端（传递配置）
		const client = getDeviceServiceClient({
			baseUrl: config.deviceService.url,
			timeout: config.deviceService.timeout,
		});

		// 并发请求所有打印机详情
		const promises = ids.map((id) =>
			client
				.getPrinterDetail(id, token)
				.then((response) => transformPrinterData(response.data, response.status, response.task))
				.catch((error) => {
					// 单个打印机详情获取失败不影响整体
					logger.warn({
						msg: `批量获取打印机 ${id} 详情失败`,
						error: error.message,
					});
					return null;
				}),
		);

		// 等待所有请求完成
		return await Promise.all(promises);
	}

	/**
	 * 获取打印机实时状态（用于轮询）
	 *
	 * 只返回实时变化的数据，不返回基本信息
	 *
	 * @param id 打印机 ID（device_name）
	 * @param token 认证 Token
	 * @returns 打印机实时状态
	 */
	async getPrinterStatus(id: string, token: string): Promise<PrinterStatusData> {
		// 获取 Device 服务客户端（传递配置）
		const client = getDeviceServiceClient({
			baseUrl: config.deviceService.url,
			timeout: config.deviceService.timeout,
		});

		// 调用外部服务获取打印机详情
		const response = await client.getPrinterDetail(id, token);

		// 转换数据格式（只返回实时状态）
		return transformPrinterStatus(response.status, response.task);
	}
}

// ============================================
// 导出单例
// ============================================

export const printerRepository = new PrinterRepository();
