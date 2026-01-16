/**
 * Device 实体 Schema (TypeBox 版本)
 *
 * 用于定义 Device 相关实体的 Schema，自动生成 OpenAPI 文档和 TypeScript 类型
 */

import { type Static, Type } from '@sinclair/typebox';

/**
 * 产品实体 Schema
 *
 * 描述一个 3D 打印机产品的完整信息
 */
export const ProductEntity = Type.Object(
	{
		/** 产品 ID */
		id: Type.String({ description: '产品 ID' }),
		/** 产品标识符 */
		productId: Type.String({ description: '产品标识符' }),
		/** 产品名称 */
		name: Type.String({ description: '产品名称' }),
		/** 产品描述 */
		description: Type.String({ description: '产品描述' }),
		/** 产品图片 URL */
		image: Type.String({ description: '产品图片 URL', format: 'uri' }),
		/** 是否激活 */
		isActive: Type.Boolean({ description: '是否激活' }),
		/** 创建时间 */
		createdAt: Type.String({
			format: 'date-time',
			description: '创建时间（ISO 8601 格式）',
		}),
		/** 创建者用户名 */
		createdBy: Type.String({ description: '创建者用户名' }),
		/** 更新时间 */
		updatedAt: Type.String({
			format: 'date-time',
			description: '更新时间（ISO 8601 格式）',
		}),
		/** 更新者用户名 */
		updatedBy: Type.String({ description: '更新者用户名' }),
		/** 删除时间（null 表示未删除） */
		deletedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()], {
			description: '删除时间（ISO 8601 格式，null 表示未删除）',
		}),
		/** 删除者用户名 */
		deletedBy: Type.Union([Type.String(), Type.Null()], {
			description: '删除者用户名',
		}),
	},
	{
		$id: 'ProductEntity',
		description: '产品信息实体',
	},
);

// ============================================
// 导出 TypeScript 类型
// ============================================

/**
 * 产品实体类型（从 Schema 自动推导）
 *
 * 使用方式：
 * ```typescript
 * import type { ProductEntityType } from '@/schemas/entities/device.entity.schema.js';
 *
 * const product: ProductEntityType = {
 *   id: '123',
 *   productId: 'P001',
 *   // ... 其他字段
 * };
 * ```
 */
export type ProductEntityType = Static<typeof ProductEntity>;
