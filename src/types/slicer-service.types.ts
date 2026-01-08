/**
 * 切片服务 API 类型定义
 *
 * 职责：
 * - 定义所有切片服务 API 的请求和响应类型
 * - 确保类型安全
 * - 提供清晰的 API 文档
 *
 * 说明：
 * - 切片服务（OrcaSlicer）是外部独立服务，负责将 3D 模型文件转换为 G-code
 * - 前期简化设计：只需传递 object_url 和 file_name，不需要配置参数
 */

// ============================================
// 任务状态枚举
// ============================================

/**
 * 切片任务状态
 */
export type SliceTaskStatus =
	| 'PENDING' // 等待处理
	| 'FETCHING' // 正在下载模型文件
	| 'PROCESSING' // 正在切片
	| 'COMPLETED' // 切片完成
	| 'FAILED' // 切片失败
	| 'CANCELLED'; // 已取消

// ============================================
// 创建切片任务 API
// ============================================

/**
 * 创建切片任务请求参数（简化版）
 *
 * 前期只需要必填字段，不需要复杂配置
 */
export interface CreateSliceTaskRequest {
	/** 3D 模型文件的预签名 URL（必填） */
	object_url: string;
	/** 文件名（必填，用于显示和日志） */
	file_name: string;
}

/**
 * 创建切片任务响应数据
 */
export interface CreateSliceTaskResponse {
	/** 切片任务 ID（UUID） */
	slice_task_id: string;
	/** 任务状态（创建时通常为 PENDING） */
	status: string;
	/** 响应消息 */
	message: string;
}

// ============================================
// 查询切片任务状态 API
// ============================================

/**
 * G-code 元数据
 */
export interface GcodeMetadata {
	/** 层高（毫米） */
	layer_height?: number;
	/** 预计打印时间（秒） */
	print_time?: number;
	/** 预计耗材用量（克） */
	filament_used?: number;
	/** 其他元数据 */
	[key: string]: unknown;
}

/**
 * 切片任务状态响应
 */
export interface SliceTaskStatusResponse {
	/** 任务 ID */
	id: string;
	/** 任务状态 */
	status: SliceTaskStatus;
	/** 进度百分比（0-100） */
	progress?: number;
	/** 原始模型文件 URL */
	object_url: string;
	/** 文件名 */
	file_name: string;
	/** G-code 文件在 MinIO 的路径 */
	gcode_minio_path?: string | null;
	/** G-code 文件下载 URL（预签名 URL） */
	gcode_download_url?: string | null;
	/** G-code 元数据（层高、打印时间等） */
	gcode_metadata?: GcodeMetadata | null;
	/** 错误信息（失败时才有） */
	error_message?: string | null;
	/** 创建时间 */
	created_at: string;
	/** 更新时间 */
	updated_at: string;
}

// ============================================
// 客户端配置
// ============================================

/**
 * SlicerServiceClient 配置
 */
export interface SlicerServiceClientConfig {
	/** 切片服务基础 URL */
	baseUrl: string;
	/** 请求超时时间（毫秒），默认 30000（30 秒） */
	timeout?: number;
	/** 是否启用日志，默认 true */
	enableLogging?: boolean;
}
