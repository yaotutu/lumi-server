import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { config } from '@/config';
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

		// 客户端错误 (4xx) - 可以返回详细信息，帮助客户端调试
		if (err.statusCode >= 400 && err.statusCode < 500) {
			reply.status(err.statusCode).send(fail(err.message, err.code, err.details));
			return;
		}

		// 服务端错误 (5xx) - 根据环境返回不同的错误信息
		// 生产环境：隐藏详细错误信息，防止泄露内部实现细节、配置信息、API 结构等
		// 开发环境：返回详细错误信息，便于调试
		if (config.isProduction) {
			// 生产环境：只返回通用错误消息
			reply
				.status(err.statusCode)
				.send(error('Internal server error', err.code || 'INTERNAL_SERVER_ERROR'));
		} else {
			// 开发环境：返回完整错误信息
			reply.status(err.statusCode).send(error(err.message, err.code, err.details));
		}
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

	// 未知错误 - 根据环境返回不同的错误信息
	log.error({ err, path: request.url }, 'Unexpected error');

	// 生产环境：隐藏详细错误信息，防止敏感信息泄露
	// 开发环境：返回详细错误信息，便于调试
	const errorMessage = config.isProduction
		? 'Internal server error'
		: err.message || 'Internal server error';

	reply.status(500).send(error(errorMessage, 'INTERNAL_SERVER_ERROR'));
}
