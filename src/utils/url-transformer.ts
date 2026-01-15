/**
 * URL 转换工具
 *
 * 将云存储的 S3 URL 转换为后端代理 URL（绝对路径）
 * 前端可直接使用，无需再拼接
 */

import { config } from '@/config/index.js';

/**
 * 将 S3 URL 转换为后端代理 URL（绝对路径）
 *
 * @param url - 原始 URL（可能是 S3 URL）
 * @param type - URL 类型（image 或 model）
 * @returns 代理 URL 相对路径或原始 URL
 *
 * @example
 * // S3 URL 转换为代理 URL 相对路径
 * transformToProxyUrl('https://ai3d-1375240212.cos.ap-guangzhou.myqcloud.com/images/xxx.png', 'image')
 * // => '/api/proxy/image?url=https%3A%2F%2F...'
 *
 * @example
 * // null 或 undefined 安全处理
 * transformToProxyUrl(null, 'image')
 * // => null
 */
export function transformToProxyUrl(
	url: string | null | undefined,
	type: 'image' | 'model',
): string | null {
	// 安全处理 null 和 undefined
	if (!url) {
		return null;
	}

	// 如果已经是代理 URL，直接返回
	if (url.includes('/api/proxy/')) {
		return url;
	}

	// 检查是否是云存储 URL（需要代理）
	const needsProxy =
		url.includes('.myqcloud.com') || // 腾讯云 COS（我们自己的 S3）
		url.includes('.aliyuncs.com') || // 阿里云 OSS（临时 URL）
		url.includes('.siliconflow.cn'); // SiliconFlow（临时 URL）

	// 不需要代理，直接返回原 URL
	if (!needsProxy) {
		return url;
	}

	const endpoint = type === 'image' ? '/api/proxy/image' : '/api/proxy/model';
	const baseUrl = config.proxy.baseUrl.replace(/\/+$/, '');
	return `${baseUrl}${endpoint}?url=${encodeURIComponent(url)}`;
}

/**
 * 批量转换图片 URL
 *
 * @param urls - URL 数组
 * @returns 转换后的 URL 数组
 */
export function transformImageUrls(urls: (string | null)[]): (string | null)[] {
	return urls.map((url) => transformToProxyUrl(url, 'image'));
}

/**
 * 批量转换模型 URL
 *
 * @param urls - URL 数组
 * @returns 转换后的 URL 数组
 */
export function transformModelUrls(urls: (string | null)[]): (string | null)[] {
	return urls.map((url) => transformToProxyUrl(url, 'model'));
}
