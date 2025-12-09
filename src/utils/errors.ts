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
