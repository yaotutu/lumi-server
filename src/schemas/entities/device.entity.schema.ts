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

// ============================================
// 打印机相关 Schema
// ============================================

/**
 * 打印机状态枚举 Schema
 */
export const PrinterStatusEnum = Type.Union(
	[
		Type.Literal('OFFLINE', { description: '离线' }),
		Type.Literal('ONLINE', { description: '在线' }),
		Type.Literal('PRINTING', { description: '打印中' }),
		Type.Literal('PAUSED', { description: '暂停' }),
		Type.Literal('ERROR', { description: '错误' }),
	],
	{
		description: '打印机状态',
	},
);

/**
 * 温度信息 Schema
 */
export const TemperatureSchema = Type.Object(
	{
		/** 当前温度 */
		current: Type.Number({ description: '当前温度' }),
		/** 目标温度 */
		target: Type.Number({ description: '目标温度' }),
	},
	{
		description: '温度信息',
	},
);

/**
 * 位置信息 Schema
 */
export const PositionSchema = Type.Object(
	{
		/** X 轴位置 */
		x: Type.Number({ description: 'X 轴位置' }),
		/** Y 轴位置 */
		y: Type.Number({ description: 'Y 轴位置' }),
		/** Z 轴位置 */
		z: Type.Number({ description: 'Z 轴位置' }),
	},
	{
		description: '位置信息',
	},
);

/**
 * 打印机实时状态 Schema
 */
export const PrinterRealtimeStatusSchema = Type.Object(
	{
		/** 喷嘴温度 */
		nozzleTemperature: TemperatureSchema,
		/** 热床温度 */
		bedTemperature: TemperatureSchema,
		/** 内部温度 */
		innerTemperature: Type.Number({ description: '内部温度' }),
		/** 位置信息 */
		position: PositionSchema,
		/** 风扇是否开启 */
		fanEnabled: Type.Boolean({ description: '风扇是否开启' }),
		/** LED 是否开启 */
		ledEnabled: Type.Boolean({ description: 'LED 是否开启' }),
	},
	{
		description: '打印机实时状态',
	},
);

/**
 * 当前打印任务 Schema
 */
export const CurrentJobSchema = Type.Object(
	{
		/** 任务名称 */
		name: Type.String({ description: '任务名称' }),
		/** 打印进度（0-100） */
		progress: Type.Number({ minimum: 0, maximum: 100, description: '打印进度（0-100）' }),
		/** 剩余时间（秒） */
		timeRemaining: Type.Number({ minimum: 0, description: '剩余时间（秒）' }),
		/** 开始时间（ISO 8601 字符串） */
		startedAt: Type.String({ format: 'date-time', description: '开始时间（ISO 8601 格式）' }),
	},
	{
		description: '当前打印任务',
	},
);

/**
 * 打印机完整信息 Schema
 */
export const PrinterSchema = Type.Object(
	{
		/** 打印机 ID */
		id: Type.String({ description: '打印机 ID' }),
		/** 打印机名称 */
		name: Type.String({ description: '打印机名称' }),
		/** 设备名称 */
		deviceName: Type.String({ description: '设备名称' }),
		/** 打印机型号 */
		model: Type.String({ description: '打印机型号' }),
		/** 打印机状态 */
		status: PrinterStatusEnum,
		/** 最后在线时间（ISO 8601 字符串，null 表示从未在线） */
		lastOnline: Type.Union([Type.String({ format: 'date-time' }), Type.Null()], {
			description: '最后在线时间（ISO 8601 格式，null 表示从未在线）',
		}),
		/** 固件版本 */
		firmwareVersion: Type.Optional(Type.String({ description: '固件版本' })),
		/** 实时状态（可能为 null） */
		realtimeStatus: Type.Union([PrinterRealtimeStatusSchema, Type.Null()], {
			description: '实时状态（null 表示无实时状态）',
		}),
		/** 当前打印任务（可能为 null） */
		currentJob: Type.Union([CurrentJobSchema, Type.Null()], {
			description: '当前打印任务（null 表示无任务）',
		}),
	},
	{
		$id: 'PrinterEntity',
		description: '打印机完整信息',
	},
);

/**
 * 打印机实时状态数据 Schema（用于轮询）
 */
export const PrinterStatusDataSchema = Type.Object(
	{
		/** 打印机状态 */
		status: PrinterStatusEnum,
		/** 实时状态 */
		realtimeStatus: PrinterRealtimeStatusSchema,
		/** 当前打印任务（可能为 null） */
		currentJob: Type.Union([CurrentJobSchema, Type.Null()], {
			description: '当前打印任务（null 表示无任务）',
		}),
		/** 更新时间（ISO 8601 字符串） */
		updatedAt: Type.String({ format: 'date-time', description: '更新时间（ISO 8601 格式）' }),
	},
	{
		$id: 'PrinterStatusData',
		description: '打印机实时状态数据（用于轮询）',
	},
);

// ============================================
// 导出 TypeScript 类型
// ============================================

/**
 * 打印机完整信息类型（从 Schema 自动推导）
 */
export type PrinterType = Static<typeof PrinterSchema>;

/**
 * 打印机实时状态数据类型（从 Schema 自动推导）
 */
export type PrinterStatusDataType = Static<typeof PrinterStatusDataSchema>;

/**
 * 打印机状态枚举类型（从 Schema 自动推导）
 */
export type PrinterStatusType = Static<typeof PrinterStatusEnum>;

/**
 * 温度信息类型（从 Schema 自动推导）
 */
export type TemperatureType = Static<typeof TemperatureSchema>;

/**
 * 位置信息类型（从 Schema 自动推导）
 */
export type PositionType = Static<typeof PositionSchema>;

/**
 * 打印机实时状态类型（从 Schema 自动推导）
 */
export type PrinterRealtimeStatusType = Static<typeof PrinterRealtimeStatusSchema>;

/**
 * 当前打印任务类型（从 Schema 自动推导）
 */
export type CurrentJobType = Static<typeof CurrentJobSchema>;
