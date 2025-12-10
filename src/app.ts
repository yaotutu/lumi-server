import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { config } from './config/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { routes } from './routes/index.js';

export async function buildApp() {
	const app = Fastify({
		logger: config.isDevelopment
			? {
					level: config.logger.level,
					transport: {
						target: 'pino-pretty',
						options: {
							colorize: true,
							translateTime: 'HH:MM:ss Z',
							ignore: 'pid,hostname',
							singleLine: true,
						},
					},
				}
			: {
					level: config.logger.level,
				},
		requestIdLogLabel: 'reqId',
		disableRequestLogging: false,
		trustProxy: true,
	});

	// 安全插件
	await app.register(helmet, {
		contentSecurityPolicy: config.isProduction
			? undefined
			: {
					directives: {
						defaultSrc: ["'self'"],
						styleSrc: ["'self'", "'unsafe-inline'"],
						scriptSrc: ["'self'", "'unsafe-inline'"],
					},
				},
	});

	// Cookie 支持
	await app.register(cookie, {
		secret: process.env.COOKIE_SECRET || 'lumi-server-secret-key-change-in-production',
		parseOptions: {},
	});

	// CORS 配置
	await app.register(cors, {
		origin: config.isDevelopment, // 生产环境需配置具体域名
		credentials: true,
	});

	// 限流
	await app.register(rateLimit, {
		max: 100,
		timeWindow: '1 minute',
		redis: undefined, // 可选：使用 Redis 共享限流状态
	});

	// 错误处理
	app.setErrorHandler(errorHandler);

	// 注册路由
	await app.register(routes);

	return app;
}
