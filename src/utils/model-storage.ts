/**
 * 模型存储工具函数
 *
 * 职责：
 * - 从腾讯云 COS 下载 3D 模型文件（可能是 ZIP）
 * - 如果是 ZIP，解压并提取模型文件（OBJ/MTL/纹理）
 * - 上传到 S3 存储服务
 * - 返回可访问的 S3 URL
 */

import AdmZip from 'adm-zip';
import { storageService } from '@/services/storage.service.js';
import { logger } from '@/utils/logger.js';

/**
 * 从远程 URL 下载 3D 模型并上传到存储服务
 *
 * @param remoteUrl 腾讯云返回的模型 URL（可能是 ZIP 文件）
 * @param modelId 模型 ID（用于存储路径）
 * @param format 模型格式（'glb' 或 'obj'）
 * @returns 存储后的 S3 URL（主模型文件的 URL）
 *
 * @throws 如果下载或上传失败
 */
export async function downloadAndUploadModel(
	remoteUrl: string,
	modelId: string,
	format = 'glb',
): Promise<string> {
	logger.info({
		msg: '📥 开始下载并上传 3D 模型',
		modelId,
		format,
		remoteUrlPreview: remoteUrl.substring(0, 80) + '...',
	});

	try {
		// 1. 下载模型到 Buffer
		logger.info({ msg: '⬇️ 正在下载模型', modelId });

		const response = await fetch(remoteUrl);

		if (!response.ok) {
			throw new Error(`下载模型失败: HTTP ${response.status} ${response.statusText}`);
		}

		// 获取 Content-Type（用于验证）
		const contentType = response.headers.get('content-type');
		logger.info({
			msg: '📄 响应 Content-Type',
			modelId,
			contentType,
		});

		// 转换为 Buffer
		const arrayBuffer = await response.arrayBuffer();
		const modelBuffer = Buffer.from(arrayBuffer);

		logger.info({
			msg: '✅ 模型下载成功',
			modelId,
			format,
			size: modelBuffer.length,
			sizeMB: (modelBuffer.length / 1024 / 1024).toFixed(2),
		});

		// 2. 检查是否是 ZIP 文件（OBJ 格式通常是 ZIP 压缩包）
		const isZip = modelBuffer[0] === 0x50 && modelBuffer[1] === 0x4b; // "PK" 魔数

		if (format === 'obj' && isZip) {
			logger.info({
				msg: '📦 检测到 OBJ ZIP 压缩包，开始解压',
				modelId,
			});
			return await handleObjZipArchive(modelId, modelBuffer);
		}

		// 3. 非 ZIP 文件，直接上传（GLB 等二进制格式）
		logger.info({
			msg: '⬆️ 正在上传到存储服务',
			modelId,
		});

		const storageUrl = await storageService.uploadModel(modelId, `model.${format}`, modelBuffer);

		logger.info({
			msg: '✅ 模型上传成功',
			modelId,
			storageUrl,
		});

		return storageUrl;
	} catch (error) {
		logger.error({
			msg: '❌ 下载或上传模型失败',
			modelId,
			remoteUrl,
			error,
		});
		throw error;
	}
}

/**
 * 处理 OBJ ZIP 压缩包
 * 解压并上传 OBJ、MTL、纹理文件到存储服务
 *
 * @param modelId 模型 ID（用于存储路径）
 * @param zipBuffer ZIP 文件的 Buffer
 * @returns OBJ 文件的存储 URL
 */
async function handleObjZipArchive(modelId: string, zipBuffer: Buffer): Promise<string> {
	try {
		// 1. 解压 ZIP 文件
		logger.info({ msg: '🔓 正在解压 ZIP 文件', modelId });
		const zip = new AdmZip(zipBuffer);
		const zipEntries = zip.getEntries();

		// 记录 ZIP 包含的文件
		const files = zipEntries
			.filter((entry) => !entry.isDirectory)
			.map((entry) => entry.entryName);
		logger.info({
			msg: '📂 ZIP 包含的文件',
			modelId,
			files,
		});

		// 2. 建立文件名映射表，用于更新 MTL 文件中的贴图路径
		const fileNameMap = new Map<string, string>();
		for (const entry of zipEntries) {
			if (entry.isDirectory) continue;
			const extension = entry.entryName.split('.').pop()?.toLowerCase() || '';
			if (['png', 'jpg', 'jpeg'].includes(extension)) {
				// 原始图片文件名 → 重命名后的文件名
				fileNameMap.set(entry.entryName, `material.${extension}`);
			}
		}

		// 3. 遍历所有文件，统一命名并上传到存储服务
		let objFileUrl = '';

		for (const entry of zipEntries) {
			// 跳过目录
			if (entry.isDirectory) continue;

			// 获取文件内容
			let fileBuffer = entry.getData();
			const extension = entry.entryName.split('.').pop()?.toLowerCase() || '';

			logger.info({
				msg: `📄 处理文件: ${entry.entryName}`,
				modelId,
				size: fileBuffer.length,
				extension,
			});

			// 统一文件命名规则
			let normalizedFileName: string;
			if (extension === 'obj') {
				normalizedFileName = 'model.obj'; // 统一命名为 model.obj
			} else if (extension === 'mtl') {
				normalizedFileName = 'material.mtl'; // 统一命名为 material.mtl

				// 处理 MTL 文件内容：更新贴图路径
				let mtlContent = fileBuffer.toString('utf8');
				let updatedCount = 0;

				// 替换 MTL 文件中的贴图路径
				for (const [originalName, newName] of fileNameMap) {
					// 转义特殊字符用于正则表达式
					const escapedOriginalName = originalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

					// 替换各种可能的贴图声明格式
					const replacements = [
						{
							pattern: new RegExp(`map_Kd\\s+${escapedOriginalName}`, 'g'),
							replacement: `map_Kd ${newName}`,
						}, // 漫反射贴图
						{
							pattern: new RegExp(`map_Ka\\s+${escapedOriginalName}`, 'g'),
							replacement: `map_Ka ${newName}`,
						}, // 环境光贴图
						{
							pattern: new RegExp(`map_Ks\\s+${escapedOriginalName}`, 'g'),
							replacement: `map_Ks ${newName}`,
						}, // 高光贴图
						{
							pattern: new RegExp(`map_Bump\\s+${escapedOriginalName}`, 'g'),
							replacement: `map_Bump ${newName}`,
						}, // 法线贴图
						{
							pattern: new RegExp(`map_d\\s+${escapedOriginalName}`, 'g'),
							replacement: `map_d ${newName}`,
						}, // 透明度贴图
						{
							pattern: new RegExp(`bump\\s+${escapedOriginalName}`, 'g'),
							replacement: `bump ${newName}`,
						}, // 简化法线贴图
						{
							pattern: new RegExp(escapedOriginalName, 'g'),
							replacement: newName,
						}, // 直接文件名引用
					];

					for (const { pattern, replacement } of replacements) {
						const matches = mtlContent.match(pattern);
						if (matches) {
							updatedCount += matches.length;
							mtlContent = mtlContent.replace(pattern, replacement);
						}
					}
				}

				if (updatedCount > 0) {
					logger.info({
						msg: '✏️ MTL 文件内容已更新贴图路径',
						modelId,
						originalFile: entry.entryName,
						updatedPaths: updatedCount,
						textureFiles: Array.from(fileNameMap.keys()),
					});
					// 使用更新后的内容
					fileBuffer = Buffer.from(mtlContent, 'utf8');
				}
			} else if (extension === 'png' || extension === 'jpg' || extension === 'jpeg') {
				normalizedFileName = `material.${extension}`; // 保持原扩展名
			} else {
				// 其他文件保持原名
				normalizedFileName = entry.entryName;
			}

			// 上传到存储服务（统一命名）
			const fileUrl = await storageService.uploadModel(modelId, normalizedFileName, fileBuffer);

			logger.info({
				msg: `✅ 文件已上传: ${normalizedFileName}`,
				modelId,
				originalName: entry.entryName,
				normalizedName: normalizedFileName,
				extension,
				url: fileUrl,
			});

			// 记录 OBJ 文件的 URL
			if (extension === 'obj') {
				objFileUrl = fileUrl;
			}
		}

		if (!objFileUrl) {
			throw new Error('ZIP 压缩包中没有找到 .obj 文件');
		}

		logger.info({
			msg: '🎉 OBJ ZIP 解压和上传完成',
			modelId,
			objFileUrl,
			totalFiles: files.length,
		});

		return objFileUrl;
	} catch (error) {
		logger.error({
			msg: '❌ 处理 OBJ ZIP 压缩包失败',
			modelId,
			error,
		});
		throw error;
	}
}

/**
 * 从远程 URL 下载预览图并上传到存储服务
 *
 * @param remoteUrl 远程预览图 URL（如：腾讯云返回的预览图 URL）
 * @param modelId 模型 ID（用于存储路径）
 * @returns 存储后的 S3 URL
 *
 * @throws 如果下载或上传失败
 */
export async function downloadAndUploadPreviewImage(
	remoteUrl: string,
	modelId: string,
): Promise<string> {
	logger.info({
		msg: '📥 开始下载并上传预览图',
		modelId,
		remoteUrlPreview: remoteUrl.substring(0, 80) + '...',
	});

	try {
		// 1. 下载预览图到 Buffer
		logger.info({ msg: '⬇️ 正在下载预览图', modelId });

		const response = await fetch(remoteUrl);

		if (!response.ok) {
			throw new Error(`下载预览图失败: HTTP ${response.status} ${response.statusText}`);
		}

		// 获取 Content-Type（用于验证）
		const contentType = response.headers.get('content-type');
		if (contentType && !contentType.startsWith('image/')) {
			logger.warn({
				msg: '⚠️ 响应的 Content-Type 不是图片类型',
				modelId,
				contentType,
			});
		}

		// 转换为 Buffer
		const arrayBuffer = await response.arrayBuffer();
		const imageBuffer = Buffer.from(arrayBuffer);

		logger.info({
			msg: '✅ 预览图下载成功',
			modelId,
			size: imageBuffer.length,
			sizeKB: (imageBuffer.length / 1024).toFixed(2),
		});

		// 2. 上传到存储服务
		logger.info({
			msg: '⬆️ 正在上传预览图到存储服务',
			modelId,
		});

		const storageUrl = await storageService.uploadModel(modelId, 'preview.png', imageBuffer);

		logger.info({
			msg: '✅ 预览图上传成功',
			modelId,
			storageUrl,
		});

		return storageUrl;
	} catch (error) {
		logger.error({
			msg: '❌ 下载或上传预览图失败',
			modelId,
			remoteUrl,
			error,
		});
		throw error;
	}
}
