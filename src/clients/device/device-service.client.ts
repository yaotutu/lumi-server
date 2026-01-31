/**
 * Device 服务客户端（业务层）
 *
 * 职责：
 * - 提供 Device 服务的具体业务接口方法
 * - 调用中间层 DeviceServiceBaseClient 的方法
 * - 处理响应数据格式转换（snake_case → camelCase）
 * - 处理时间戳转换（Unix 秒 → ISO 8601 字符串）
 *
 * 不包含：
 * - HTTP 请求逻辑（由 BaseServiceClient 处理）
 * - 响应格式验证（由 DeviceServiceBaseClient 处理）
 * - 错误处理（由 DeviceServiceBaseClient 处理）
 *
 * 继承关系：
 * BaseServiceClient → DeviceServiceBaseClient → DeviceServiceClient
 *
 * 说明：
 * - Device 服务是外部独立服务，负责管理 3D 打印机设备和产品信息
 * - 本实现仅封装产品查询接口，后续可扩展设备管理、任务管理等功能
 */

import type { ProductEntityType } from '@/schemas/entities/device.entity.schema.js';
import type {
	DeviceServiceClientConfig,
	GetProductsRequest,
	Product,
} from '@/types/device-service.types.js';
import { DeviceServiceBaseClient } from './device-service-base.client.js';

/**
 * Device 服务客户端类
 *
 * 继承 DeviceServiceBaseClient，复用响应格式处理逻辑。
 */
export class DeviceServiceClient extends DeviceServiceBaseClient {
	/**
	 * 查询产品列表
	 *
	 * 外部服务响应格式：
	 * ```json
	 * {
	 *   "code": 200,
	 *   "msg": "success",
	 *   "data": [
	 *     {
	 *       "id": "1",
	 *       "product_id": "printer-001",
	 *       "name": "3D Printer Model X",
	 *       "created_at": 1704067200,  // Unix 秒级时间戳
	 *       ...
	 *     }
	 *   ],
	 *   "total": 100
	 * }
	 * ```
	 *
	 * 内部响应格式（转换后）：
	 * ```json
	 * {
	 *   "products": [
	 *     {
	 *       "id": "1",
	 *       "productId": "printer-001",
	 *       "name": "3D Printer Model X",
	 *       "createdAt": "2024-01-01T00:00:00.000Z",  // ISO 8601 字符串
	 *       ...
	 *     }
	 *   ],
	 *   "total": 100
	 * }
	 * ```
	 *
	 * @param params 查询参数（page, size, keyword）
	 * @param token 认证 Token（用户的 Bearer Token）
	 * @returns 转换后的产品列表响应
	 *
	 * @example
	 * ```typescript
	 * const client = new DeviceServiceClient({ baseUrl: 'http://device.ai3d.top' });
	 * const { products, total } = await client.getProducts({
	 *   page: 0,
	 *   size: 10,
	 *   keyword: 'printer'
	 * }, 'Bearer xxx');
	 * console.log(`总计: ${total} 条，返回: ${products.length} 条`);
	 * ```
	 */
	async getProducts(
		params: GetProductsRequest,
		token: string,
	): Promise<{ products: ProductEntityType[]; total: number }> {
		// 构建查询字符串
		const queryParams = new URLSearchParams({
			page: String(params.page),
			size: String(params.size),
		});

		// 添加可选的 keyword 参数
		if (params.keyword) {
			queryParams.set('keyword', params.keyword);
		}

		// 构建完整端点（带查询参数）
		const endpoint = `/api/v1.0/product?${queryParams.toString()}`;

		// 调用中间层的 deviceRequestPaginated 方法
		// 中间层会自动处理：
		// - HTTP 请求发送
		// - code 字段验证
		// - 认证错误处理
		// - data 数组验证
		// - 解包 { data, total }
		const { data, total } = await this.deviceRequestPaginated<Product>(
			endpoint,
			{ method: 'GET' },
			token,
		);

		// 格式转换：snake_case → camelCase
		// Unix 时间戳（秒）→ ISO 8601 字符串
		const products = data.map((product) => ({
			id: product.id,
			// 字段重命名：product_id → productId
			productId: product.product_id,
			name: product.name,
			description: product.description,
			image: product.image,
			// 字段重命名：is_active → isActive
			isActive: product.is_active,
			// 时间戳转换：Unix 秒 → ISO 8601 字符串
			createdAt: new Date(product.created_at * 1000).toISOString(),
			// 字段重命名：created_by → createdBy
			createdBy: product.created_by,
			// 时间戳转换：Unix 秒 → ISO 8601 字符串
			updatedAt: new Date(product.updated_at * 1000).toISOString(),
			// 字段重命名：updated_by → updatedBy
			updatedBy: product.updated_by,
			// 时间戳转换：Unix 秒 → ISO 8601 字符串（可能为 null）
			deletedAt: product.deleted_at ? new Date(product.deleted_at * 1000).toISOString() : null,
			// 字段重命名：deleted_by → deletedBy（可能为空字符串，转为 null）
			deletedBy: product.deleted_by || null,
		}));

		// 返回转换后的数据
		return { products, total };
	}

	/**
	 * 获取打印机列表
	 *
	 * 外部服务响应格式：
	 * ```json
	 * {
	 *   "code": 200,
	 *   "msg": "success",
	 *   "data": [
	 *     {
	 *       "id": "01KG6CVPN91BCCXKHSN52HZJEB",
	 *       "product_id": "R1",
	 *       "product_name": "R1 系统 3D打印机",
	 *       "device_name": "R1-BS2HWR",
	 *       "state": 0,
	 *       "status": 1,
	 *       "last_online_time": 0,
	 *       ...
	 *     }
	 *   ],
	 *   "total": 1
	 * }
	 * ```
	 *
	 * @param params 查询参数（page, size）
	 * @param token 认证 Token（用户的 Bearer Token）
	 * @returns 打印机列表响应（原始格式，不做转换）
	 *
	 * @example
	 * ```typescript
	 * const client = new DeviceServiceClient({ baseUrl: 'http://device.topeai3d.com' });
	 * const response = await client.getPrinterList({ page: 1, size: 10 }, 'Bearer xxx');
	 * ```
	 */
	async getPrinterList(
		params: { page: number; size: number },
		token: string,
	): Promise<{ code: number; data: any[]; msg: string; total: number }> {
		// 构建查询字符串
		const queryParams = new URLSearchParams({
			page: String(params.page),
			size: String(params.size),
		});

		// 构建完整端点（带查询参数）
		const endpoint = `/api/v1.0/my/device/list?${queryParams.toString()}`;

		// 调用中间层的 deviceRequestPaginated 方法
		const { data, total } = await this.deviceRequestPaginated<any>(
			endpoint,
			{ method: 'GET' },
			token,
		);

		// 返回原始格式（前端适配器会处理格式转换）
		return {
			code: 200,
			data,
			msg: 'success',
			total,
		};
	}

	/**
	 * 获取打印机详情
	 *
	 * 外部服务响应格式：
	 * ```json
	 * {
	 *   "code": 200,
	 *   "msg": "success",
	 *   "data": { ... },
	 *   "status": { ... },
	 *   "task": { ... }
	 * }
	 * ```
	 *
	 * @param deviceId 打印机 ID
	 * @param token 认证 Token（用户的 Bearer Token）
	 * @returns 打印机详情响应（原始格式，不做转换）
	 *
	 * @example
	 * ```typescript
	 * const client = new DeviceServiceClient({ baseUrl: 'http://device.topeai3d.com' });
	 * const response = await client.getPrinterDetail('01KG6CVPN91BCCXKHSN52HZJEB', 'Bearer xxx');
	 * ```
	 */
	async getPrinterDetail(
		deviceId: string,
		token: string,
	): Promise<{ code: number; data: any; msg: string; status: any; task: any }> {
		// 构建完整端点（带查询参数：device_id 和 id 都传递 deviceId）
		const endpoint = `/api/v1.0/my/device/${deviceId}?device_id=${deviceId}&id=${deviceId}`;

		// 调用父类的 request 方法（获取完整响应）
		const response = await this.request<{
			code: number;
			msg: string;
			data: any;
			status: any;
			task: any;
		}>(endpoint, { method: 'GET' }, token);

		// 验证 code 字段
		if (response.code !== 200) {
			// 特殊处理：认证错误（401）
			if (response.code === 401) {
				throw new Error('Device 服务认证失败');
			}

			// 其他业务错误
			throw new Error(`Device 服务错误: ${response.msg}`);
		}

		// 返回完整响应（包括 status 和 task）
		return response;
	}

	/**
	 * 绑定打印机
	 *
	 * 外部服务响应格式：
	 * ```json
	 * {
	 *   "code": 200,
	 *   "msg": "success"
	 * }
	 * ```
	 *
	 * @param params 绑定参数（device_name, code）
	 * @param token 认证 Token（用户的 Bearer Token）
	 * @returns void
	 *
	 * @throws Error 当绑定失败时
	 *
	 * @example
	 * ```typescript
	 * const client = new DeviceServiceClient({ baseUrl: 'http://device.topeai3d.com' });
	 * await client.bindPrinter({
	 *   device_name: 'R1-AX6FFI',
	 *   code: 'FTD8CZ'
	 * }, 'Bearer xxx');
	 * ```
	 */
	async bindPrinter(params: { device_name: string; code: string }, token: string): Promise<void> {
		// 构建完整端点
		const endpoint = '/api/v1.0/my/device/bind';

		// 调用父类的 request 方法（POST 请求）
		const response = await this.request<{
			code: number;
			msg: string;
		}>(
			endpoint,
			{
				method: 'POST',
				body: JSON.stringify(params),
				headers: {
					'Content-Type': 'application/json',
				},
			},
			token,
		);

		// 验证 code 字段
		if (response.code !== 200) {
			// 特殊处理：认证错误（401）
			if (response.code === 401) {
				throw new Error('Device 服务认证失败');
			}

			// 其他业务错误
			throw new Error(`绑定失败: ${response.msg}`);
		}
	}

	/**
	 * 解绑打印机
	 *
	 * 外部服务响应格式：
	 * ```json
	 * {
	 *   "code": 200,
	 *   "msg": "success"
	 * }
	 * ```
	 *
	 * @param params 解绑参数（device_id）
	 * @param token 认证 Token（用户的 Bearer Token）
	 * @returns void
	 *
	 * @throws Error 当解绑失败时
	 *
	 * @example
	 * ```typescript
	 * const client = new DeviceServiceClient({ baseUrl: 'http://device.topeai3d.com' });
	 * await client.unbindPrinter({
	 *   device_id: '01KG6CVPN91BCCXKHSN52HZJEB'
	 * }, 'Bearer xxx');
	 * ```
	 */
	async unbindPrinter(params: { device_id: string }, token: string): Promise<void> {
		// 构建完整端点
		const endpoint = '/api/v1.0/my/device/unbind';

		// 调用父类的 request 方法（POST 请求）
		const response = await this.request<{
			code: number;
			msg: string;
		}>(
			endpoint,
			{
				method: 'POST',
				body: JSON.stringify(params),
				headers: {
					'Content-Type': 'application/json',
				},
			},
			token,
		);

		// 验证 code 字段
		if (response.code !== 200) {
			// 特殊处理：认证错误（401）
			if (response.code === 401) {
				throw new Error('Device 服务认证失败');
			}

			// 其他业务错误
			throw new Error(`解绑失败: ${response.msg}`);
		}
	}

	/**
	 * 创建打印任务
	 *
	 * 外部服务响应格式：
	 * ```json
	 * {
	 *   "code": 200,
	 *   "msg": "success"
	 * }
	 * ```
	 *
	 * 或错误响应：
	 * ```json
	 * {
	 *   "code": 400,
	 *   "msg": "invalid params"
	 * }
	 * ```
	 *
	 * @param params 打印任务参数
	 * @param params.device_name 打印机设备名称
	 * @param params.file_name 文件名称
	 * @param params.gcode_url G-code 文件 URL
	 * @param params.image 预览图 URL（可选）
	 * @param params.user_id 用户 ID
	 * @param token 认证 Token（用户的 Bearer Token）
	 * @returns 打印任务创建结果
	 *
	 * @throws Error 当创建失败时
	 *
	 * @example
	 * ```typescript
	 * const client = new DeviceServiceClient({ baseUrl: 'http://device.topeai3d.com' });
	 * const result = await client.createPrintTask({
	 *   device_name: 'R1-BS2HWR',
	 *   file_name: 'model.glb',
	 *   gcode_url: 'https://s3.amazonaws.com/bucket/model.gcode',
	 *   user_id: 'user-123'
	 * }, 'Bearer xxx');
	 * ```
	 */
	async createPrintTask(
		params: {
			device_name: string;
			file_name: string;
			gcode_url: string;
			image?: string;
			user_id: string;
		},
		token: string,
	): Promise<{ code: number; msg: string }> {
		// 构建完整端点
		const endpoint = '/api/v1.0/task/start';

		// 调用父类的 request 方法（POST 请求）
		const response = await this.request<{
			code: number;
			msg: string;
		}>(
			endpoint,
			{
				method: 'POST',
				body: JSON.stringify(params),
				headers: {
					'Content-Type': 'application/json',
				},
			},
			token,
		);

		// 返回完整响应（Service 层会处理 code 验证）
		return response;
	}
}

// ============================================
// 默认实例（单例模式）
// ============================================

let defaultInstance: DeviceServiceClient | null = null;

/**
 * 获取默认的 Device 服务客户端实例
 *
 * @param config 配置（首次调用时需要提供）
 * @returns DeviceServiceClient 实例
 *
 * @example
 * ```typescript
 * // 首次调用（初始化）
 * const client = getDeviceServiceClient({
 *   baseUrl: 'http://device.ai3d.top',
 *   timeout: 10000,
 * });
 *
 * // 后续调用（复用实例）
 * const client = getDeviceServiceClient();
 * ```
 */
export function getDeviceServiceClient(config?: DeviceServiceClientConfig): DeviceServiceClient {
	if (!defaultInstance) {
		if (!config) {
			throw new Error('DeviceServiceClient not initialized. Please provide config on first call.');
		}
		defaultInstance = new DeviceServiceClient(config);
	}
	return defaultInstance;
}

/**
 * 重置默认实例（主要用于测试）
 *
 * @example
 * ```typescript
 * // 在测试中重置实例
 * afterEach(() => {
 *   resetDeviceServiceClient();
 * });
 * ```
 */
export function resetDeviceServiceClient(): void {
	defaultInstance = null;
}
