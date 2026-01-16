/**
 * Clients 统一导出
 *
 * 用法：
 * import { getUserServiceClient } from '@/clients';
 * import { getDeviceServiceClient } from '@/clients';
 * import { getSlicerServiceClient } from '@/clients';
 */

// 基础设施层
export * from './base/index.js';

// Device 服务
export * from './device/index.js';
// Slicer 服务
export * from './slicer/index.js';
// User 服务
export * from './user/index.js';
