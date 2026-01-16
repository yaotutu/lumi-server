export class AppError extends Error {
	constructor(
		message: string,
		public statusCode = 500,
		public code?: string,
		public details?: unknown,
	) {
		super(message);
		this.name = this.constructor.name;
		Error.captureStackTrace(this, this.constructor);
	}
}

export class ValidationError extends AppError {
	constructor(message: string, details?: unknown) {
		super(message, 400, 'VALIDATION_ERROR', details);
	}
}

export class NotFoundError extends AppError {
	constructor(resource: string) {
		super(`${resource} not found`, 404, 'NOT_FOUND');
	}
}

export class UnauthorizedError extends AppError {
	constructor(message = 'Unauthorized') {
		super(message, 401, 'UNAUTHORIZED');
	}
}

export class ForbiddenError extends AppError {
	constructor(message = 'Forbidden') {
		super(message, 403, 'FORBIDDEN');
	}
}

export class ConflictError extends AppError {
	constructor(message: string) {
		super(message, 409, 'CONFLICT');
	}
}

export class InternalServerError extends AppError {
	constructor(message = 'Internal server error', details?: unknown) {
		super(message, 500, 'INTERNAL_SERVER_ERROR', details);
	}
}

export class ServiceUnavailableError extends AppError {
	constructor(message = 'Service temporarily unavailable') {
		super(message, 503, 'SERVICE_UNAVAILABLE');
	}
}

/**
 * 无效状态错误 (409 Conflict)
 */
export class InvalidStateError extends AppError {
	constructor(message: string, details?: unknown) {
		super(message, 409, 'INVALID_STATE', details);
	}
}

/**
 * 队列已满错误 (503 Service Unavailable)
 */
export class QueueFullError extends AppError {
	constructor(message = 'Queue is full') {
		super(message, 503, 'QUEUE_FULL');
	}
}

/**
 * 数据库错误 (500 Internal Server Error)
 */
export class DatabaseError extends AppError {
	constructor(message: string, details?: unknown) {
		super(message, 500, 'DATABASE_ERROR', details);
	}
}

/**
 * 外部 API 错误 (500 Internal Server Error)
 */
export class ExternalAPIError extends AppError {
	constructor(
		message: string,
		public readonly provider?: string,
		details?: unknown,
	) {
		super(message, 500, 'EXTERNAL_API_ERROR', details);
	}
}

/**
 * 未认证错误 (401 Unauthorized)
 * 用于表示用户未提供有效的认证凭据（未登录）
 * 与 UnauthorizedError 的区别：
 * - UnauthenticatedError: 用户未登录
 * - UnauthorizedError: Token无效或过期
 */
export class UnauthenticatedError extends AppError {
	constructor(message = '未认证') {
		super(message, 401, 'UNAUTHENTICATED');
	}
}
