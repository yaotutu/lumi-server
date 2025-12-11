/**
 * 响应工具函数测试
 * 这是我们按照 TDD 原则写的第一个测试
 */

import { error, fail, success } from '@/utils/response.js';
import { describe, expect, it } from 'vitest';

describe('Response Utils', () => {
	// 测试成功响应
	describe('success', () => {
		it('应该返回正确格式的成功响应', () => {
			// Arrange (准备)
			const data = { id: 1, name: 'test' };

			// Act (执行)
			const result = success(data);

			// Assert (断言)
			expect(result).toEqual({
				status: 'success',
				data: data,
			});
		});

		it('应该处理不同类型的数据', () => {
			expect(success('message')).toEqual({
				status: 'success',
				data: 'message',
			});

			expect(success(123)).toEqual({
				status: 'success',
				data: 123,
			});

			expect(success(null)).toEqual({
				status: 'success',
				data: null,
			});
		});
	});

	// 测试失败响应
	describe('fail', () => {
		it('应该返回正确格式的失败响应', () => {
			const result = fail('参数错误', 'VALIDATION_ERROR');

			expect(result).toEqual({
				status: 'fail',
				data: {
					message: '参数错误',
					code: 'VALIDATION_ERROR',
				},
			});
		});

		it('应该只传递消息也能工作', () => {
			const result = fail('简单错误');

			expect(result).toEqual({
				status: 'fail',
				data: {
					message: '简单错误',
				},
			});
		});
	});

	// 测试错误响应
	describe('error', () => {
		it('应该返回正确格式的错误响应', () => {
			const result = error('服务器错误', 'INTERNAL_ERROR');

			expect(result).toEqual({
				status: 'error',
				message: '服务器错误',
				code: 'INTERNAL_ERROR',
			});
		});
	});
});
