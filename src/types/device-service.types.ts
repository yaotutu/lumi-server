/**
 * Device 服务 API 类型定义
 *
 * 用于定义与外部 Device 设备管理服务交互的所有类型
 * 外部服务使用 snake_case 命名规范
 */

// ============================================
// 产品实体类型
// ============================================

/**
 * 产品信息
 *
 * 描述一个 3D 打印机产品的完整信息
 */
export interface Product {
	/** 产品唯一 ID */
	id: string;
	/** 产品标识符 */
	product_id: string;
	/** 产品名称 */
	name: string;
	/** 产品描述 */
	description: string;
	/** 产品图片 URL */
	image: string;
	/** 是否激活 */
	is_active: boolean;
	/** 创建时间戳（Unix 秒级时间戳） */
	created_at: number;
	/** 创建者用户名 */
	created_by: string;
	/** 更新时间戳（Unix 秒级时间戳） */
	updated_at: number;
	/** 更新者用户名 */
	updated_by: string;
	/** 删除时间戳（Unix 秒级时间戳，null 表示未删除） */
	deleted_at: number;
	/** 删除者用户名 */
	deleted_by: string;
}

// ============================================
// 外部服务响应格式
// ============================================

/**
 * 外部 Device 服务的统一响应格式
 *
 * 所有外部 API 都返回这个格式的响应
 *
 * @template T 响应数据的类型
 */
export interface DeviceServiceResponse<T> {
	/** 响应码（200 表示成功） */
	code: number;
	/** 响应消息 */
	msg: string;
	/** 总记录数（仅分页接口有，可选） */
	total?: number;
	/** 响应数据 */
	data: T;
}

// ============================================
// 查询产品列表 API
// ============================================

/**
 * 查询产品列表请求参数
 */
export interface GetProductsRequest {
	/** 页码（从 0 开始） */
	page: number;
	/** 每页数量 */
	size: number;
	/** 搜索关键词（可选） */
	keyword?: string;
}

/**
 * 查询产品列表响应
 */
export interface GetProductsResponse {
	/** 响应码（200 表示成功） */
	code: number;
	/** 响应消息 */
	msg: string;
	/** 总记录数 */
	total: number;
	/** 产品列表 */
	data: Product[];
}

// ============================================
// Client 配置
// ============================================

/**
 * DeviceServiceClient 配置
 *
 * 用于初始化 Device 服务客户端的配置选项
 */
export interface DeviceServiceClientConfig {
	/** Device 服务基础 URL */
	baseUrl: string;
	/** 请求超时时间（毫秒），默认 30000（30 秒） */
	timeout?: number;
	/** 是否启用日志，默认 true */
	enableLogging?: boolean;
}
