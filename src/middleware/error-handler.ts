import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { error, fail } from '../utils/response.js';

export async function errorHandler(
	err: FastifyError | Error,
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<void> {
	const { log } = request;

	// Zod 验证错误
	if (err instanceof ZodError) {
		log.warn({ err, path: request.url }, 'Validation error');
		reply.status(400).send(
			fail('Validation failed', 'VALIDATION_ERROR', {
				errors: err.issues,
			}),
		);
		return;
	}

	// 应用程序自定义错误
	if (err instanceof AppError) {
		log.warn({ err, path: request.url }, `AppError: ${err.message}`);

		// 客户端错误 (4xx)
		if (err.statusCode >= 400 && err.statusCode < 500) {
			reply.status(err.statusCode).send(fail(err.message, err.code, err.details));
			return;
		}

		// 服务端错误 (5xx)
		reply.status(err.statusCode).send(error(err.message, err.code, err.details));
		return;
	}

	// Fastify 内置错误
	if ('statusCode' in err && err.statusCode) {
		if (err.statusCode >= 400 && err.statusCode < 500) {
			log.warn({ err, path: request.url }, `Fastify error: ${err.message}`);
			reply.status(err.statusCode).send(fail(err.message, err.code));
			return;
		}
	}

	// 未知错误
	log.error({ err, path: request.url }, 'Unexpected error');
	reply.status(500).send(error('Internal server error', 'INTERNAL_SERVER_ERROR'));
}
