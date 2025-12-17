/**
 * 外部用户服务 API 类型定义
 *
 * 职责：
 * - 定义所有用户服务 API 的请求和响应类型
 * - 确保类型安全
 * - 提供清晰的 API 文档
 */

// ============================================
// 外部服务响应格式（统一格式）
// ============================================

/**
 * 外部用户服务的标准响应格式
 */
export interface UserServiceResponse<T = unknown> {
	/** 状态码，200 表示成功 */
	code: number;
	/** 响应消息 */
	msg: string;
	/** 响应数据（成功时才有） */
	data?: T;
}

// ============================================
// 发送验证码 API
// ============================================

/**
 * 验证码类型
 */
export type VerifyCodeType = 'login' | 'register' | 'modify_password';

/**
 * 发送验证码请求参数
 */
export interface SendVerifyCodeRequest {
	/** 用户邮箱 */
	email: string;
	/** 验证码类型 */
	type: VerifyCodeType;
}

/**
 * 发送验证码响应（外部服务无返回数据）
 */
export type SendVerifyCodeResponse = UserServiceResponse<undefined>;

// ============================================
// 注册 API
// ============================================

/**
 * 注册请求参数
 */
export interface RegisterRequest {
	/** 用户邮箱 */
	email: string;
	/** 邮箱验证码 */
	random_code: string;
}

/**
 * 注册响应（外部服务无返回数据）
 */
export type RegisterResponse = UserServiceResponse<undefined>;

// ============================================
// 登录 API
// ============================================

/**
 * 登录类型
 */
export type LoginType = 'code' | 'password';

/**
 * 登录请求参数
 */
export interface LoginRequest {
	/** 登录类型 */
	login_type: LoginType;
	/** 用户邮箱 */
	email: string;
	/** 邮箱验证码（login_type 为 'code' 时必填） */
	random_code?: string;
	/** 用户名（login_type 为 'password' 时必填） */
	user_name?: string;
	/** 密码（login_type 为 'password' 时必填） */
	password?: string;
}

/**
 * 登录响应数据
 */
export interface LoginData {
	/** Bearer Token（已包含 "Bearer " 前缀） */
	token: string;
}

/**
 * 登录响应（返回 Token 字符串）
 */
export type LoginResponse = UserServiceResponse<string>;

// ============================================
// 获取用户信息 API
// ============================================

/**
 * 用户信息数据
 */
export interface UserInfoData {
	/** 用户 ID */
	user_id: string;
	/** 用户名 */
	user_name: string;
	/** 用户昵称 */
	nick_name: string;
	/** 邮箱（可能不返回） */
	email?: string;
	/** 头像（可能不返回） */
	avatar?: string;
	/** 性别（可能不返回） */
	gender?: string;
	/** 创建时间（Unix 时间戳） */
	created_at?: number;
	/** 更新时间（Unix 时间戳） */
	updated_at?: number;
}

/**
 * 获取用户信息响应
 */
export type GetUserInfoResponse = UserServiceResponse<UserInfoData>;

// ============================================
// 退出登录 API
// ============================================

/**
 * 退出登录响应（外部服务无返回数据）
 */
export type LogoutResponse = UserServiceResponse<undefined>;

// ============================================
// 客户端配置
// ============================================

/**
 * UserServiceClient 配置
 */
export interface UserServiceClientConfig {
	/** 用户服务基础 URL */
	baseUrl: string;
	/** 请求超时时间（毫秒），默认 10000 */
	timeout?: number;
	/** 是否启用日志，默认 true */
	enableLogging?: boolean;
}
