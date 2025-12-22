import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import scalar from '@scalar/fastify-api-reference';
import Fastify from 'fastify';
import { config } from './config/index.js';
import { fastifyLoggerTransport } from './config/logger.config.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { errorHandler } from './middleware/error-handler.js';
import { routes } from './routes/index.js';

export async function buildApp() {
	const app = Fastify({
		logger: config.isDevelopment
			? {
					level: config.logger.level,
					transport: fastifyLoggerTransport,
					// 限制对象深度和属性数量，防止日志过长
					depthLimit: 3,
					edgeLimit: 20,
				}
			: {
					level: config.logger.level,
					// 限制对象深度和属性数量，防止日志过长
					depthLimit: 3,
					edgeLimit: 20,
				},
		requestIdLogLabel: 'reqId',
		disableRequestLogging: false,
		trustProxy: true,
	});

	// 安全插件 - 需要为 Scalar UI 放宽 CSP 限制
	await app.register(helmet, {
		contentSecurityPolicy: config.isProduction ? undefined : false, // 开发环境禁用 CSP 以支持 Scalar UI
		crossOriginResourcePolicy: { policy: 'cross-origin' }, // ✅ 允许跨域资源加载（解决图片代理 CORP 问题）
	});

	// CORS 配置 - 允许所有来源（开发环境）
	await app.register(cors, {
		origin: true, // ✅ 允许所有来源（开发时使用，生产环境应改为具体域名）
		credentials: true, // 允许携带凭证（Cookie、Authorization header）
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], // 明确允许的 HTTP 方法
		allowedHeaders: ['Content-Type', 'Authorization'], // 允许的请求头
	});

	// 限流
	await app.register(rateLimit, {
		max: 100,
		timeWindow: '1 minute',
		redis: undefined, // 可选：使用 Redis 共享限流状态
	});

	// OpenAPI 文档配置
	await app.register(swagger, {
		openapi: {
			openapi: '3.1.0',
			info: {
				title: 'Lumi Server API',
				description: 'AI 图像和 3D 模型生成服务 - 完整的 RESTful API 文档',
				version: '1.0.0',
				contact: {
					name: 'API Support',
					email: 'support@lumi.com',
				},
			},
			servers: [
				{
					url: 'http://localhost:3000',
					description: '开发环境',
				},
				{
					url: 'http://localhost:3001',
					description: '测试环境',
				},
			],
			tags: [
				{ name: '认证', description: '用户认证相关接口 - 邮箱验证码登录' },
				{
					name: '任务',
					description: '生成任务相关接口 - 创建和管理图片/模型生成任务',
				},
				{ name: '模型', description: '3D 模型管理接口 - 查看、发布、更新模型' },
				{ name: '交互', description: '用户交互接口 - 点赞、收藏功能' },
				{ name: '健康检查', description: '系统健康检查接口' },
			],
			components: {
				securitySchemes: {
					bearerAuth: {
						type: 'http',
						scheme: 'bearer',
						bearerFormat: 'JWT',
						description: 'Bearer Token 认证（Authorization: Bearer <token>）',
					},
				},
			},
		},
	});

	// Scalar API 文档 UI
	await app.register(scalar, {
		routePrefix: '/docs',
		configuration: {
			theme: 'purple', // 主题：default, alternate, moon, purple, solarized
			// 更多配置项
			hideModels: false, // 显示数据模型
			hideDownloadButton: false, // 显示下载按钮
			searchHotKey: 'k', // 搜索快捷键
		},
	});

	// 认证中间件（必须在路由之前注册）
	app.addHook('onRequest', authMiddleware);

	// 错误处理
	app.setErrorHandler(errorHandler);

	// 注册路由
	await app.register(routes);

	// OpenAPI YAML 导出端点
	// 必须在路由注册之后，确保 swagger 已生成完整的 OpenAPI 规范
	app.get('/api/openapi', async (_request, reply) => {
		try {
			const yaml = await app.swagger({ yaml: true });
			return reply
				.status(200)
				.headers({
					'Content-Type': 'application/x-yaml',
					'Access-Control-Allow-Origin': '*', // 允许 Swagger UI 跨域访问
					'Cache-Control': 'no-cache', // 开发环境不缓存，方便调试
				})
				.send(yaml);
		} catch (_error) {
			return reply.status(500).send({
				success: false,
				error: '无法生成 OpenAPI 规范文件',
			});
		}
	});

	return app;
}
