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

import AdmZip from 'adm-zip';
import { logger } from '@/utils/logger';
import type { FastifyInstance } from 'fastify';

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
	fastify.get<{ Querystring: { url?: string } }>('/api/proxy/image', async (request, reply) => {
		try {
			// 从查询参数获取图片URL
			const imageUrl = request.query.url;

			// 验证URL参数
			if (!imageUrl) {
				return reply.status(400).send({ error: 'Missing image URL parameter' });
			}

			// 验证URL是允许的域名（安全检查，防止代理被滥用）
			// 支持两种格式：
			// 1. 图片生成 API 的临时 URL：xxx.aliyuncs.com, xxx.siliconflow.cn 等
			// 2. 我们自己的 COS：xxx.myqcloud.com
			let isAllowed = false;
			try {
				const url = new URL(imageUrl);
				// 检查是否包含允许的域名
				isAllowed =
					url.hostname.includes('.myqcloud.com') || // 腾讯云 COS
					url.hostname.includes('.aliyuncs.com') || // 阿里云 OSS（阿里云图片生成）
					url.hostname.includes('.siliconflow.cn'); // SiliconFlow（图片生成）
			} catch {
				return reply.status(400).send({ error: 'Invalid URL format' });
			}

			if (!isAllowed) {
				return reply.status(403).send({
					error: 'URL not from allowed domain (must be .myqcloud.com, .aliyuncs.com, or .siliconflow.cn)',
				});
			}

			// 从源获取图片文件
			const response = await fetch(imageUrl);

			// 检查响应状态
			if (!response.ok) {
				logger.error({
					msg: 'Failed to fetch image',
					url: imageUrl,
					status: response.status,
					statusText: response.statusText,
				});
				return reply.status(response.status).send({ error: 'Failed to fetch image file' });
			}

			// 获取原始 Content-Type，如果没有则默认为 image/png
			const contentType = response.headers.get('content-type') || 'image/png';

			// 获取文件数据
			const arrayBuffer = await response.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

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
	});

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
	fastify.get<{ Querystring: { url?: string } }>('/api/proxy/model', async (request, reply) => {
		try {
			// 从查询参数获取模型URL
			const modelUrl = request.query.url;

			// 验证URL参数
			if (!modelUrl) {
				return reply.status(400).send({ error: 'Missing model URL parameter' });
			}

			// 验证URL是腾讯云COS域名（安全检查，防止代理被滥用）
			// 支持两种格式：
			// 1. 腾讯云混元 3D：xxx.tencentcos.cn
			// 2. 我们自己的 COS：xxx.myqcloud.com
			let isAllowed = false;
			try {
				const url = new URL(modelUrl);
				// 检查是否包含腾讯云相关域名
				isAllowed = url.hostname.includes('.tencentcos.cn') || url.hostname.includes('.myqcloud.com');
			} catch {
				return reply.status(400).send({ error: 'Invalid URL format' });
			}

			if (!isAllowed) {
				return reply.status(403).send({
					error: 'URL not from allowed domain (must be .tencentcos.cn or .myqcloud.com)',
				});
			}

			// 从腾讯云获取模型文件
			const response = await fetch(modelUrl);

			// 检查响应状态
			if (!response.ok) {
				logger.error({
					msg: 'Failed to fetch model from Tencent COS',
					status: response.status,
					statusText: response.statusText,
				});
				return reply.status(response.status).send({ error: 'Failed to fetch model file' });
			}

			// 获取文件数据
			const arrayBuffer = await response.arrayBuffer();
			let buffer = Buffer.from(arrayBuffer);

			// 根据文件扩展名确定 Content-Type
			let extension = modelUrl.split('.').pop()?.toLowerCase() || '';
			let contentType = 'application/octet-stream'; // 默认二进制流

			// ✅ 检查是否是 ZIP 文件（腾讯云混元 3D 返回的是 ZIP 文件）
			const isZipFile = extension === 'zip' || buffer.toString('utf8', 0, 2) === 'PK';

			if (isZipFile) {
				logger.info({ msg: '检测到 ZIP 文件，开始解压', url: modelUrl });

				try {
					// 使用 adm-zip 解压 ZIP 文件
					const zip = new AdmZip(buffer);
					const zipEntries = zip.getEntries();

					logger.info({
						msg: 'ZIP 文件内容',
						entries: zipEntries.map((entry) => entry.entryName),
					});

					// 查找模型文件（OBJ, GLB, GLTF）
					const modelEntry = zipEntries.find((entry) => {
						const entryExt = entry.entryName.split('.').pop()?.toLowerCase();
						return entryExt === 'obj' || entryExt === 'glb' || entryExt === 'gltf';
					});

					if (!modelEntry) {
						logger.error({
							msg: 'ZIP 文件中未找到模型文件',
							entries: zipEntries.map((e) => e.entryName),
						});
						return reply.status(400).send({ error: 'No model file found in ZIP archive' });
					}

					// 提取模型文件
					const extractedBuffer = zip.readFile(modelEntry);
					if (!extractedBuffer) {
						logger.error({
							msg: 'ZIP 文件提取失败',
							fileName: modelEntry.entryName,
						});
						return reply.status(500).send({ error: 'Failed to read file from ZIP archive' });
					}
					buffer = Buffer.from(extractedBuffer);
					extension = modelEntry.entryName.split('.').pop()?.toLowerCase() || '';

					logger.info({
						msg: '✅ 从 ZIP 中提取模型文件',
						fileName: modelEntry.entryName,
						size: `${buffer.length} bytes`,
					});
				} catch (error) {
					logger.error({ msg: 'ZIP 解压失败', error });
					return reply.status(500).send({ error: 'Failed to extract ZIP file' });
				}
			}

			// 根据实际文件扩展名确定 Content-Type
			if (extension === 'glb') {
				contentType = 'model/gltf-binary';
			} else if (extension === 'gltf') {
				contentType = 'model/gltf+json';
			} else if (extension === 'obj') {
				// OBJ 文件调试：检查文件头
				const fileHeader = buffer.toString('utf8', 0, Math.min(100, buffer.length));
				logger.info({ msg: 'OBJ 文件头', fileHeader });
				logger.info({ msg: 'OBJ 文件大小', size: `${buffer.length} bytes` });

				// 检查是否是有效的 OBJ 文件（应该包含 'v ' 或 'f ' 等标记）
				if (!fileHeader.includes('v ') && !fileHeader.includes('f ')) {
					logger.warn({ msg: '警告: OBJ 文件格式可能不正确' });
				}

				contentType = 'text/plain'; // OBJ 是文本格式
			} else if (extension === 'mtl') {
				// MTL 材质文件（文本格式）
				contentType = 'text/plain';
			} else if (extension === 'fbx') {
				contentType = 'application/octet-stream';
			}
			// 图片格式（纹理）
			else if (extension === 'png') {
				contentType = 'image/png';
			} else if (extension === 'jpg' || extension === 'jpeg') {
				contentType = 'image/jpeg';
			} else if (extension === 'gif') {
				contentType = 'image/gif';
			} else if (extension === 'webp') {
				contentType = 'image/webp';
			}

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
	});
}
