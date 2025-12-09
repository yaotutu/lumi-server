/**
 * Model3D Provider 工厂函数
 *
 * 职责：根据环境变量自动选择合适的 Model3D Provider
 *
 * 目前只支持腾讯云混元 3D
 */

import { config } from '@/config/index';
import { logger } from '@/utils/logger';
import { TencentModel3DAdapter } from './adapters/tencent';
import type { Model3DProvider, Model3DProviderType } from './types';

/**
 * 获取当前应该使用的 Model3D Provider 类型
 */
export function getModel3DProviderType(): Model3DProviderType {
	// 检查腾讯云配置
	if (config.providers.tencent.secretId && config.providers.tencent.secretKey) {
		logger.info({ msg: '使用腾讯云混元 3D Provider' });
		return 'tencent';
	}

	// 未配置任何渠道
	throw new Error(
		'未配置 3D 模型生成渠道，请设置 TENCENTCLOUD_SECRET_ID 和 TENCENTCLOUD_SECRET_KEY',
	);
}

/**
 * 创建 Model3D Provider 实例
 *
 * @returns Model3DProvider 实例
 */
export function createModel3DProvider(): Model3DProvider {
	const providerType = getModel3DProviderType();

	switch (providerType) {
		case 'tencent':
			return new TencentModel3DAdapter();

		default:
			throw new Error(`不支持的 Model3D Provider 类型: ${providerType}`);
	}
}
