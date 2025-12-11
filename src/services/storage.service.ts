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
			// 自定义 endpoint（如 MinIO）
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
}

// 单例模式
export const storageService = new StorageService();
