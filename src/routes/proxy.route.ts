/**
 * 图片和模型代理路由
 * 作用：解决腾讯云、阿里云等云存储的 CORS 跨域问题
 *
 * 工作原理：
 * 1. 接收前端请求（带有云存储 URL 作为查询参数）
 * 2. 后端服务器 fetch 云存储 URL（服务端请求无 CORS 限制）
 * 3. 将获取的文件流式传输给前端
 * 4. 设置正确的 Content-Type 和 CORS 头
 */

import type { FastifyInstance } from 'fastify';
import { config } from '@/config/index.js';
import { proxyImageSchema, proxyModelSchema } from '@/schemas/routes/proxy.schema';
import * as ProxyService from '@/services/proxy.service';
import { logger } from '@/utils/logger';

function getProxyBaseUrl(_request: {
	protocol: string;
	hostname: string;
	headers: Record<string, string | string[] | undefined>;
}) {
	return config.proxy.baseUrl.replace(/\/+$/, '');
}

/**
 * 注册代理路由
 */
export async function proxyRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/proxy/image
	 * 图片代理接口
	 *
	 * 白名单域名：
	 * - .myqcloud.com（腾讯云 COS）
	 * - .aliyuncs.com（阿里云 OSS）
	 * - .siliconflow.cn（SiliconFlow 图片生成）
	 */
	fastify.get<{ Querystring: { url?: string } }>(
		'/api/proxy/image',
		{ schema: proxyImageSchema },
		async (request, reply) => {
			try {
				// 从查询参数获取图片URL
				const imageUrl = request.query.url;

				// 验证URL参数
				if (!imageUrl) {
					return reply.status(400).send({ error: 'Missing image URL parameter' });
				}

				// 验证URL格式
				let _isValidUrl = false;
				try {
					new URL(imageUrl);
					_isValidUrl = true;
				} catch {
					return reply.status(400).send({ error: 'Invalid URL format' });
				}

				// ✅ 调用 Service 验证 URL 是否来自允许的域名（已重构到 Service 层）
				const isAllowed = ProxyService.validateImageUrl(imageUrl);

				if (!isAllowed) {
					return reply.status(403).send({
						error:
							'URL not from allowed domain (must be .myqcloud.com, .aliyuncs.com, or .siliconflow.cn)',
					});
				}

				// ✅ 调用 Service 代理图片（已重构到 Service 层）
				const { buffer, contentType } = await ProxyService.proxyImage(imageUrl);

				// 返回文件流，设置正确的Content-Type
				return reply
					.status(200)
					.headers({
						'Content-Type': contentType, // 使用原始的 Content-Type
						'Content-Length': buffer.length.toString(),
						'Cache-Control': 'public, max-age=31536000', // 缓存1年（图片文件不会变）
						'Access-Control-Allow-Origin': '*', // 允许跨域
						'Access-Control-Allow-Methods': 'GET, OPTIONS',
						'Access-Control-Allow-Headers': 'Content-Type',
					})
					.send(buffer);
			} catch (error) {
				logger.error({ msg: 'Image proxy error', error });
				return reply.code(500).send({ error: 'Internal server error' });
			}
		},
	);

	/**
	 * GET /api/proxy/model
	 * 3D模型文件代理接口
	 *
	 * 白名单域名：
	 * - .tencentcos.cn（腾讯云混元 3D）
	 * - .myqcloud.com（我们自己的 COS）
	 *
	 * 支持的格式：
	 * - OBJ: text/plain（3D 几何体）
	 * - MTL: text/plain（材质定义）
	 * - GLB: model/gltf-binary
	 * - GLTF: model/gltf+json
	 * - FBX: application/octet-stream
	 * - PNG/JPG/JPEG: image/png, image/jpeg（纹理图片）
	 * - ZIP: 自动解压并提取模型文件（腾讯云混元 3D）
	 */
	fastify.get<{ Querystring: { url?: string } }>(
		'/api/proxy/model',
		{ schema: proxyModelSchema },
		async (request, reply) => {
			try {
				// 从查询参数获取模型URL
				const modelUrl = request.query.url;

				// 验证URL参数
				if (!modelUrl) {
					return reply.status(400).send({ error: 'Missing model URL parameter' });
				}

				// 验证URL格式
				try {
					new URL(modelUrl);
				} catch {
					return reply.status(400).send({ error: 'Invalid URL format' });
				}

				// ✅ 调用 Service 验证 URL 是否来自允许的域名（已重构到 Service 层）
				const isAllowed = ProxyService.validateModelUrl(modelUrl);

				if (!isAllowed) {
					return reply.status(403).send({
						error: 'URL not from allowed domain (must be .tencentcos.cn or .myqcloud.com)',
					});
				}

				// ✅ 调用 Service 代理模型（已重构到 Service 层）
				const { buffer, contentType } = await ProxyService.proxyModel(
					modelUrl,
					getProxyBaseUrl(request),
				);

				// 返回文件流，设置正确的Content-Type
				return reply
					.status(200)
					.headers({
						'Content-Type': contentType,
						'Content-Length': buffer.length.toString(),
						'Cache-Control': 'public, max-age=31536000', // 缓存1年（模型文件不会变）
						'Access-Control-Allow-Origin': '*', // 允许跨域
						'Access-Control-Allow-Methods': 'GET, OPTIONS',
						'Access-Control-Allow-Headers': 'Content-Type',
					})
					.send(buffer);
			} catch (error) {
				logger.error({ msg: 'Model proxy error', error });
				return reply.code(500).send({ error: 'Internal server error' });
			}
		},
	);
}
