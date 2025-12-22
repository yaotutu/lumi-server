/**
 * Image (Generated Image) 实体 Schema
 * 与数据库 generated_images 表对应
 */

import { type Static, Type } from '@sinclair/typebox';
import { ImageStatusEnum } from './enums.schema';

/**
 * 生成图片基础 Schema
 */
export const ImageEntity = Type.Object(
	{
		id: Type.String({ description: '图片 ID' }),
		requestId: Type.String({ description: '所属任务 ID' }),
		index: Type.Integer({ minimum: 0, maximum: 3, description: '图片索引 (0-3)' }),
		imageUrl: Type.Union([Type.String(), Type.Null()], {
			description: '图片 URL',
		}),
		imagePrompt: Type.Union([Type.String(), Type.Null()], {
			description: '图片生成提示词',
		}),
		imageStatus: ImageStatusEnum,
		createdAt: Type.String({ format: 'date-time', description: '创建时间' }),
		completedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()], {
			description: '完成时间',
		}),
		failedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()], {
			description: '失败时间',
		}),
		errorMessage: Type.Union([Type.String(), Type.Null()], {
			description: '错误信息',
		}),
	},
	{
		$id: 'ImageEntity',
		description: '生成图片实体',
	},
);

/**
 * 图片简化 Schema (仅核心字段)
 * 用于列表展示
 */
export const ImageSummary = Type.Object(
	{
		id: Type.String({ description: '图片 ID' }),
		index: Type.Integer({ description: '图片索引' }),
		imageUrl: Type.Union([Type.String(), Type.Null()]),
		imageStatus: ImageStatusEnum,
	},
	{
		$id: 'ImageSummary',
		description: '图片摘要信息',
	},
);

/**
 * 类型推导
 */
export type ImageEntityType = Static<typeof ImageEntity>;
export type ImageSummaryType = Static<typeof ImageSummary>;
