/**
 * 错误类测试
 * 学习如何测试自定义错误类
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  InternalServerError,
  ServiceUnavailableError,
  InvalidStateError,
  QueueFullError,
  DatabaseError,
  ExternalAPIError,
} from './errors.js';

describe('错误类测试', () => {
  // 测试基础错误类
  describe('AppError', () => {
    it('应该创建一个基础应用错误', () => {
      // Arrange - 准备测试数据
      const message = 'Something went wrong';
      const statusCode = 500;
      const code = 'APP_ERROR';

      // Act - 执行要测试的操作
      const error = new AppError(message, statusCode, code);

      // Assert - 验证结果
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe(message);
      expect(error.statusCode).toBe(statusCode);
      expect(error.code).toBe(code);
      expect(error.name).toBe('AppError');
    });

    it('应该使用默认的状态码', () => {
      // Arrange & Act
      const error = new AppError('Default error');

      // Assert
      expect(error.statusCode).toBe(500);
      expect(error.code).toBeUndefined();
    });

    it('应该包含详细信息', () => {
      // Arrange
      const details = { field: 'email', value: 'invalid' };

      // Act
      const error = new AppError('Validation failed', 400, 'VALIDATION_ERROR', details);

      // Assert
      expect(error.details).toEqual(details);
    });
  });

  // 测试验证错误类
  describe('ValidationError', () => {
    it('应该创建一个验证错误', () => {
      // Arrange & Act
      const error = new ValidationError('Email is invalid');

      // Assert
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Email is invalid');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('应该包含验证详细信息', () => {
      // Arrange
      const details = { field: 'age', message: 'Must be positive' };

      // Act
      const error = new ValidationError('Invalid age', details);

      // Assert
      expect(error.details).toEqual(details);
    });
  });

  // 测试未找到错误类
  describe('NotFoundError', () => {
    it('应该创建一个未找到错误', () => {
      // Arrange & Act
      const error = new NotFoundError('User');

      // Assert
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });
  });

  // 测试未授权错误类
  describe('UnauthorizedError', () => {
    it('应该创建一个未授权错误', () => {
      // Arrange & Act
      const error = new UnauthorizedError();

      // Assert
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('应该使用自定义消息', () => {
      // Arrange & Act
      const error = new UnauthorizedError('Token expired');

      // Assert
      expect(error.message).toBe('Token expired');
      expect(error.statusCode).toBe(401);
    });
  });

  // 测试禁止访问错误类
  describe('ForbiddenError', () => {
    it('应该创建一个禁止访问错误', () => {
      // Arrange & Act
      const error = new ForbiddenError();

      // Assert
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toBe('Forbidden');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
    });
  });

  // 测试冲突错误类
  describe('ConflictError', () => {
    it('应该创建一个冲突错误', () => {
      // Arrange & Act
      const error = new ConflictError('Email already exists');

      // Assert
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toBe('Email already exists');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
    });
  });

  // 测试外部API错误类
  describe('ExternalAPIError', () => {
    it('应该创建一个外部API错误', () => {
      // Arrange & Act
      const error = new ExternalAPIError('API call failed', 'OpenAI');

      // Assert
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ExternalAPIError);
      expect(error.message).toBe('API call failed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('EXTERNAL_API_ERROR');
      expect(error.provider).toBe('OpenAI');
    });

    it('应该包含详细信息', () => {
      // Arrange
      const details = { status: 429, message: 'Rate limit exceeded' };

      // Act
      const error = new ExternalAPIError('Rate limit exceeded', 'OpenAI', details);

      // Assert
      expect(error.details).toEqual(details);
    });
  });
});