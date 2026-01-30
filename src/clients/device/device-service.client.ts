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
