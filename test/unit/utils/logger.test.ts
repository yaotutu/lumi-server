/**
 * Logger 工具测试
 * 测试 HTTP 请求日志记录功能
 */

import { logger } from '@/utils/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 在每个测试前重置 mock
describe('Logger - logRequest 功能', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// 这里开始写具体的测试用例
	it('应该记录成功请求的日志', () => {
		// Arrange - 准备测试数据
		const mockInfo = vi.fn();
		vi.spyOn(logger, 'info').mockImplementation(mockInfo);

		const requestData = {
			method: 'GET',
			path: '/api/users',
			statusCode: 200,
			duration: 150,
			userId: 'user123',
		};

		// Act - 调用要测试的功能
		logger.logRequest(requestData);

		// Assert - 验证结果
		expect(mockInfo).toHaveBeenCalledTimes(1);
		expect(mockInfo).toHaveBeenCalledWith(
			expect.objectContaining({
				method: 'GET',
				path: '/api/users',
				statusCode: 200,
				duration: 150,
				userId: 'user123',
			}),
		);
	});

	// it('应该使用正确的日志级别记录错误请求', () => {
	//     // Arrange
	//     const mockError = vi.fn();
	//     const mockWarn = vi.fn();
	//     const mockInfo = vi.fn();

	//     vi.spyOn(logger, 'error').mockImplementation(mockError);
	//     vi.spyOn(logger, 'warn').mockImplementation(mockWarn);
	//     vi.spyOn(logger, 'info').mockImplementation(mockInfo);

	//     const requestData = {
	//         method: 'POST',
	//         path: '/api/models',
	//         statusCode: 500,
	//         duration: 2000
	//     };

	//     // Act
	//     logger.logRequest(requestData);

	//     // Assert
	//     expect(mockError).toHaveBeenCalledTimes(1);
	//     expect(mockWarn).toHaveBeenCalledTimes(0);
	//     expect(mockInfo).toHaveBeenCalledTimes(0);
	// });
	// it('应该处理缺失的userId参数', () => {
	//     // Arrange
	//     const mockInfo = vi.fn();
	//     vi.spyOn(logger, 'info').mockImplementation(mockInfo);

	//     const requestData = {
	//         method: 'PUT',
	//         path: '/api/models/123',
	//         statusCode: 200,
	//         duration: 100
	//         // 没有userId
	//     };

	//     // Act
	//     logger.logRequest(requestData);

	//     // Assert
	//     expect(mockInfo).toHaveBeenCalledWith(
	//         expect.objectContaining({
	//             method: 'PUT',
	//             path: '/api/models/123',
	//             statusCode: 200,
	//             duration: 100
	//         })
	//     );
	// });
});

// describe('日志级别映射', () => {
//     it('2xx状态码应该使用info级别', () => {
//         const mockInfo = vi.fn();
//         vi.spyOn(logger, 'info').mockImplementation(mockInfo);

//         logger.logRequest({ method: 'GET', path: '/', statusCode: 200, duration: 100 });
//         expect(mockInfo).toHaveBeenCalledTimes(1);
//     });

//     it('4xx状态码应该使用warn级别', () => {
//         const mockWarn = vi.fn();
//         vi.spyOn(logger, 'warn').mockImplementation(mockWarn);

//         logger.logRequest({ method: 'GET', path: '/', statusCode: 404, duration: 100 });
//         expect(mockWarn).toHaveBeenCalledTimes(1);
//     });

//     it('5xx状态码应该使用error级别', () => {
//         const mockError = vi.fn();
//         vi.spyOn(logger, 'error').mockImplementation(mockError);

//         logger.logRequest({ method: 'GET', path: '/', statusCode: 500, duration: 100 });
//         expect(mockError).toHaveBeenCalledTimes(1);
//     });
// });
