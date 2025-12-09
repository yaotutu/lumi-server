/**
 * JSend 响应格式规范
 * https://github.com/omniti-labs/jsend
 */

export interface SuccessResponse<T = unknown> {
	status: 'success';
	data: T;
}

export interface FailResponse {
	status: 'fail';
	data: {
		message: string;
		code?: string;
		details?: unknown;
	};
}

export interface ErrorResponse {
	status: 'error';
	message: string;
	code?: string;
	data?: unknown;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | FailResponse | ErrorResponse;

/**
 * 成功响应
 */
export function success<T>(data: T): SuccessResponse<T> {
	return {
		status: 'success',
		data,
	};
}

/**
 * 失败响应（客户端错误）
 */
export function fail(message: string, code?: string, details?: unknown): FailResponse {
	return {
		status: 'fail',
		data: {
			message,
			code,
			details,
		},
	};
}

/**
 * 错误响应（服务端错误）
 */
export function error(message: string, code?: string, data?: unknown): ErrorResponse {
	return {
		status: 'error',
		message,
		code,
		data,
	};
}
