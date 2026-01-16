/**
 * Proxy Service
 * 代理服务层
 *
 * 从 proxy.route.ts 搬运过来的业务逻辑
 * 解决腾讯云、阿里云等云存储的 CORS 跨域问题
 */

import AdmZip from 'adm-zip';
import { logger } from '@/utils/logger';

/**
 * 验证图片 URL 是否来自允许的域名
 */
export function validateImageUrl(imageUrl: string): boolean {
	try {
		const url = new URL(imageUrl);
		// 检查是否包含允许的域名
		return (
			url.hostname.includes('.myqcloud.com') || // 腾讯云 COS
			url.hostname.includes('.aliyuncs.com') || // 阿里云 OSS（阿里云图片生成）
			url.hostname.includes('.siliconflow.cn')
		); // SiliconFlow（图片生成）
	} catch {
		return false;
	}
}

/**
 * 验证模型 URL 是否来自允许的域名
 */
export function validateModelUrl(modelUrl: string): boolean {
	try {
		const url = new URL(modelUrl);
		// 检查是否包含腾讯云相关域名
		return url.hostname.includes('.tencentcos.cn') || url.hostname.includes('.myqcloud.com');
	} catch {
		return false;
	}
}

/**
 * 代理图片文件（从 Router 搬运的完整逻辑）
 */
export async function proxyImage(imageUrl: string): Promise<{
	buffer: Buffer;
	contentType: string;
}> {
	// 👇 从 Router 搬运的逻辑（原封不动）
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
		throw new Error(`Failed to fetch image file: ${response.status}`);
	}

	// 获取原始 Content-Type，如果没有则默认为 image/png
	const contentType = response.headers.get('content-type') || 'image/png';

	// 获取文件数据
	const arrayBuffer = await response.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	return {
		buffer,
		contentType,
	};
}

/**
 * 从 ZIP 文件中提取模型文件
 */
function extractModelFromZip(buffer: Buffer): { buffer: Buffer; extension: string } {
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
		throw new Error('No model file found in ZIP archive');
	}

	// 提取模型文件
	const extractedBuffer = zip.readFile(modelEntry);
	if (!extractedBuffer) {
		logger.error({
			msg: 'ZIP 文件提取失败',
			fileName: modelEntry.entryName,
		});
		throw new Error('Failed to read file from ZIP archive');
	}

	const extension = modelEntry.entryName.split('.').pop()?.toLowerCase() || '';

	logger.info({
		msg: '✅ 从 ZIP 中提取模型文件',
		fileName: modelEntry.entryName,
		size: `${extractedBuffer.length} bytes`,
	});

	return {
		buffer: Buffer.from(extractedBuffer),
		extension,
	};
}

/**
 * 处理 MTL 文件中的纹理路径
 */
function processMtlFile(
	buffer: Buffer,
	modelUrl: string,
	proxyBaseUrl: string,
): { buffer: Buffer; contentType: string } {
	try {
		const mtlContent = buffer.toString('utf8');

		// 从原始 URL 中提取基础路径（去掉文件名）
		const baseUrl = modelUrl.substring(0, modelUrl.lastIndexOf('/'));

		// 替换所有纹理引用的相对路径
		// 匹配格式：map_Kd material.png, map_Ka texture.jpg 等
		const updatedMtlContent = mtlContent.replace(
			/(map_\w+|bump)\s+(\S+)/g,
			(match, mapType, texturePath) => {
				// 如果已经是完整 URL，不处理
				if (texturePath.startsWith('http://') || texturePath.startsWith('https://')) {
					return match;
				}

				// 构建完整的云存储 URL
				const fullTextureUrl = `${baseUrl}/${texturePath}`;

				// 构建代理 URL
				const proxyUrl = `${proxyBaseUrl}/api/proxy/model?url=${encodeURIComponent(fullTextureUrl)}`;

				logger.info({
					msg: '🔄 替换 MTL 纹理路径',
					original: texturePath,
					fullUrl: fullTextureUrl,
					proxyUrl,
				});

				return `${mapType} ${proxyUrl}`;
			},
		);

		const updatedBuffer = Buffer.from(updatedMtlContent, 'utf8');

		logger.info({
			msg: '✅ MTL 文件纹理路径已替换',
			originalSize: mtlContent.length,
			newSize: updatedBuffer.length,
		});

		return {
			buffer: updatedBuffer,
			contentType: 'text/plain',
		};
	} catch (error) {
		logger.error({ msg: '❌ MTL 文件路径替换失败', error });
		// 失败时返回原始内容
		return {
			buffer,
			contentType: 'text/plain',
		};
	}
}

/**
 * 代理模型文件（从 Router 搬运的完整逻辑）
 */
export async function proxyModel(
	modelUrl: string,
	proxyBaseUrl: string,
): Promise<{
	buffer: Buffer;
	contentType: string;
}> {
	// 👇 从 Router 搬运的逻辑（原封不动）
	// 从腾讯云获取模型文件
	const response = await fetch(modelUrl);

	// 检查响应状态
	if (!response.ok) {
		logger.error({
			msg: 'Failed to fetch model from Tencent COS',
			status: response.status,
			statusText: response.statusText,
		});
		throw new Error(`Failed to fetch model file: ${response.status}`);
	}

	// 获取文件数据
	const arrayBuffer = await response.arrayBuffer();
	let buffer: Buffer = Buffer.from(arrayBuffer);

	// 根据文件扩展名确定 Content-Type
	let extension = modelUrl.split('.').pop()?.toLowerCase() || '';
	let contentType = 'application/octet-stream'; // 默认二进制流

	// ✅ 检查是否是 ZIP 文件（腾讯云混元 3D 返回的是 ZIP 文件）
	const isZipFile = extension === 'zip' || buffer.toString('utf8', 0, 2) === 'PK';

	if (isZipFile) {
		logger.info({ msg: '检测到 ZIP 文件，开始解压', url: modelUrl });

		try {
			const extracted = extractModelFromZip(buffer);
			buffer = extracted.buffer;
			extension = extracted.extension;
		} catch (error) {
			logger.error({ msg: 'ZIP 解压失败', error });
			throw new Error('Failed to extract ZIP file');
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
		// ✅ 处理 MTL 文件中的纹理路径
		const processed = processMtlFile(buffer, modelUrl, proxyBaseUrl);
		buffer = processed.buffer;
		contentType = processed.contentType;
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

	return {
		buffer,
		contentType,
	};
}
