import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface UploadOptions {
	contentType?: string;
	metadata?: Record<string, string>;
}

class StorageService {
	private s3Client: S3Client;
	private bucket: string;

	constructor() {
		this.s3Client = new S3Client({
			endpoint: config.s3.endpoint,
			region: config.s3.region,
			credentials: {
				accessKeyId: config.s3.accessKeyId,
				secretAccessKey: config.s3.secretAccessKey,
			},
			forcePathStyle: config.s3.forcePathStyle,
		});
		this.bucket = config.s3.bucket;

		logger.info(
			{
				endpoint: config.s3.endpoint,
				region: config.s3.region,
				bucket: this.bucket,
			},
			'S3 storage service initialized',
		);
	}

	/**
	 * 上传文件到 S3
	 */
	async upload(key: string, data: Buffer, options: UploadOptions = {}): Promise<string> {
		try {
			const command = new PutObjectCommand({
				Bucket: this.bucket,
				Key: key,
				Body: data,
				ContentType: options.contentType || 'application/octet-stream',
				Metadata: options.metadata,
			});

			await this.s3Client.send(command);
			logger.info({ key, size: data.length }, 'File uploaded successfully');

			return this.getPublicUrl(key);
		} catch (error) {
			logger.error({ error, key }, 'Failed to upload file');
			throw error;
		}
	}

	/**
	 * 从 S3 下载文件
	 */
	async download(key: string): Promise<Buffer> {
		try {
			const command = new GetObjectCommand({
				Bucket: this.bucket,
				Key: key,
			});

			const response = await this.s3Client.send(command);
			const data = await response.Body?.transformToByteArray();

			if (!data) {
				throw new Error('Failed to download file: empty response');
			}

			logger.info({ key, size: data.length }, 'File downloaded successfully');
			return Buffer.from(data);
		} catch (error) {
			logger.error({ error, key }, 'Failed to download file');
			throw error;
		}
	}

	/**
	 * 删除文件
	 */
	async delete(key: string): Promise<void> {
		try {
			const command = new DeleteObjectCommand({
				Bucket: this.bucket,
				Key: key,
			});

			await this.s3Client.send(command);
			logger.info({ key }, 'File deleted successfully');
		} catch (error) {
			logger.error({ error, key }, 'Failed to delete file');
			throw error;
		}
	}

	/**
	 * 获取签名 URL（用于临时访问私有文件）
	 */
	async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
		try {
			const command = new GetObjectCommand({
				Bucket: this.bucket,
				Key: key,
			});

			const url = await getSignedUrl(this.s3Client, command, { expiresIn });
			logger.debug({ key, expiresIn }, 'Generated signed URL');
			return url;
		} catch (error) {
			logger.error({ error, key }, 'Failed to generate signed URL');
			throw error;
		}
	}

	/**
	 * 获取公开 URL
	 */
	getPublicUrl(key: string): string {
		if (config.s3.endpoint) {
			// 检查是否是腾讯云 COS
			if (config.s3.endpoint.includes('myqcloud.com')) {
				// 腾讯云 COS URL 格式：https://{bucket}.cos.{region}.myqcloud.com/{key}
				return `https://${this.bucket}.cos.${config.s3.region}.myqcloud.com/${key}`;
			}
			// 其他自定义 endpoint（如 MinIO）：{endpoint}/{bucket}/{key}
			const baseUrl = config.s3.endpoint.replace(/\/$/, '');
			return `${baseUrl}/${this.bucket}/${key}`;
		}
		// AWS S3 标准 URL
		return `https://${this.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;
	}

	/**
	 * 生成唯一的文件 key
	 */
	generateKey(prefix: string, filename: string): string {
		const timestamp = Date.now();
		const randomStr = Math.random().toString(36).substring(2, 8);
		const ext = filename.split('.').pop();
		return `${prefix}/${timestamp}-${randomStr}.${ext}`;
	}

	/**
	 * 生成缩略图名称
	 * 在原文件名基础上添加 _thumb 后缀，避免重复添加
	 * @param key - 原始文件key
	 * @returns 带有 _thumb 后缀的文件key
	 */
	generateThumbnailName(key: string): string {
		const THUMBNAIL_SUFFIX = '_thumb';

		// 如果已经包含缩略图后缀，避免重复添加
		if (key.includes(`${THUMBNAIL_SUFFIX}.`)) {
			return key;
		}

		// 使用正则表达式匹配文件名和扩展名
		const match = key.match(/^(.*)(\.[^.]+)$/);

		if (match) {
			// 有扩展名的文件：在扩展名前插入后缀
			const [, nameWithoutExt, extension] = match;
			return `${nameWithoutExt}${THUMBNAIL_SUFFIX}${extension}`;
		}
		// 没有扩展名的文件：直接在末尾添加后缀
		return `${key}${THUMBNAIL_SUFFIX}`;
	}

	/**
	 * 上传模型文件到 S3
	 * 路径格式: models/{modelId}/{filename}
	 *
	 * @param modelId 模型 ID
	 * @param filename 文件名（如 model.obj, material.mtl, material.png）
	 * @param data 文件数据
	 * @returns S3 公开访问 URL
	 */
	async uploadModel(modelId: string, filename: string, data: Buffer): Promise<string> {
		const key = `models/${modelId}/${filename}`;

		// 根据文件扩展名确定 Content-Type
		const ext = filename.split('.').pop()?.toLowerCase();
		let contentType = 'application/octet-stream';

		if (ext === 'obj' || ext === 'mtl') {
			contentType = 'text/plain';
		} else if (ext === 'glb') {
			contentType = 'model/gltf-binary';
		} else if (ext === 'gltf') {
			contentType = 'model/gltf+json';
		} else if (ext === 'png') {
			contentType = 'image/png';
		} else if (ext === 'jpg' || ext === 'jpeg') {
			contentType = 'image/jpeg';
		}

		return this.upload(key, data, { contentType });
	}

	/**
	 * 从 URL 下载图片并上传到 S3
	 * 路径格式: images/{requestId}/{index}.png
	 *
	 * @param imageUrl 临时图片 URL（阿里云/SiliconFlow）
	 * @param requestId 生成请求 ID
	 * @param index 图片索引
	 * @returns S3 公开访问 URL
	 */
	async uploadImageFromUrl(imageUrl: string, requestId: string, index: number): Promise<string> {
		try {
			logger.info({ imageUrl, requestId, index }, '📥 开始从临时 URL 下载图片');

			// 1. 从临时 URL 下载图片
			const response = await fetch(imageUrl);
			if (!response.ok) {
				throw new Error(`下载图片失败: ${response.status} ${response.statusText}`);
			}

			const arrayBuffer = await response.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

			logger.info({ size: buffer.length, requestId, index }, '✅ 图片下载成功，准备上传到 S3');

			// 2. 生成 S3 key（使用 PNG 格式）
			const key = `images/${requestId}/${index}.png`;

			// 3. 上传到 S3
			const s3Url = await this.upload(key, buffer, {
				contentType: 'image/png',
				metadata: {
					requestId,
					index: index.toString(),
					sourceUrl: imageUrl,
				},
			});

			logger.info({ s3Url, requestId, index }, '✅ 图片已上传到 S3');

			return s3Url;
		} catch (error) {
			logger.error({ error, imageUrl, requestId, index }, '❌ 上传图片到 S3 失败');
			throw error;
		}
	}
}

// 单例模式
export const storageService = new StorageService();
