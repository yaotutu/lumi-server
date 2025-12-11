/**
 * 存储服务测试 - TDD 演示
 * 我们先写测试，再实现功能
 */

import { storageService } from '@/services/storage.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('存储服务 - TDD演示', () => {
	beforeEach(() => {
		// 在每个测试前重置mock
		vi.clearAllMocks();
	});

	describe('generateThumbnailName', () => {
		it('应该生成缩略图名称', () => {
			// Arrange - 准备测试数据
			const originalKey = 'models/1234567890-abcdef/image.jpg';

			// Act - 执行要测试的功能 (这个功能还不存在!)
			const thumbnailName = storageService.generateThumbnailName(originalKey);

			// Assert - 验证结果
			expect(thumbnailName).toBe('models/1234567890-abcdef/image_thumb.jpg');
		});

		it('应该处理没有扩展名的文件', () => {
			// Arrange
			const originalKey = 'models/1234567890-abcdef/image';

			// Act
			const thumbnailName = storageService.generateThumbnailName(originalKey);

			// Assert
			expect(thumbnailName).toBe('models/1234567890-abcdef/image_thumb');
		});

		it('应该处理已包含thumb的文件名', () => {
			// Arrange
			const originalKey = 'models/1234567890-abcdef/image_thumb.jpg';

			// Act
			const thumbnailName = storageService.generateThumbnailName(originalKey);

			// Assert
			expect(thumbnailName).toBe('models/1234567890-abcdef/image_thumb.jpg');
		});
	});
});
