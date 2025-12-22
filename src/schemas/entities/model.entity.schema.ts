/**
 * Model 实体 Schema
 * 与数据库 models 表对应
 */

import { type Static, Type } from '@sinclair/typebox';
import { ModelSourceEnum, ModelVisibilityEnum, PrintStatusEnum } from './enums.schema';

/**
 * 3D 模型基础 Schema
 */
export const ModelEntity = Type.Object(
	{
		id: Type.String({ description: '模型 ID' }),
		externalUserId: Type.String({ description: '所属用户 ID' }),
		source: ModelSourceEnum,
		requestId: Type.Union([Type.String(), Type.Null()], {
			description: '关联的生成请求 ID (AI 生成时)',
		}),
		sourceImageId: Type.Union([Type.String(), Type.Null()], {
			description: '来源图片 ID (AI 生成时)',
		}),
		name: Type.String({ description: '模型名称' }),
		description: Type.Union([Type.String(), Type.Null()], {
			description: '模型描述',
		}),
		modelUrl: Type.Union([Type.String(), Type.Null()], {
			description: '模型文件 URL',
		}),
		mtlUrl: Type.Union([Type.String(), Type.Null()], {
			description: 'MTL 材质文件 URL (OBJ 格式)',
		}),
		textureUrl: Type.Union([Type.String(), Type.Null()], {
			description: '纹理图片 URL (OBJ 格式)',
		}),
		previewImageUrl: Type.Union([Type.String(), Type.Null()], {
			description: '预览图 URL',
		}),
		format: Type.String({ default: 'OBJ', description: '模型格式' }),
		fileSize: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()], {
			description: '文件大小 (字节)',
		}),
		visibility: ModelVisibilityEnum,
		publishedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()], {
			description: '发布时间',
		}),
		viewCount: Type.Integer({ minimum: 0, default: 0, description: '浏览次数' }),
		likeCount: Type.Integer({ minimum: 0, default: 0, description: '点赞数' }),
		favoriteCount: Type.Integer({ minimum: 0, default: 0, description: '收藏数' }),
		downloadCount: Type.Integer({ minimum: 0, default: 0, description: '下载次数' }),
		sliceTaskId: Type.Union([Type.String(), Type.Null()], {
			description: '切片任务 ID',
		}),
		printStatus: Type.Union([PrintStatusEnum, Type.Null()], {
			description: '打印状态',
		}),
		createdAt: Type.String({ format: 'date-time', description: '创建时间' }),
		updatedAt: Type.String({ format: 'date-time', description: '更新时间' }),
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
		$id: 'ModelEntity',
		description: '3D 模型实体',
	},
);

/**
 * 模型摘要 Schema (用于列表展示)
 */
export const ModelSummary = Type.Object(
	{
		id: Type.String({ description: '模型 ID' }),
		name: Type.String({ description: '模型名称' }),
		previewImageUrl: Type.Union([Type.String(), Type.Null()], {
			description: '预览图 URL',
		}),
		visibility: ModelVisibilityEnum,
		likeCount: Type.Integer({ minimum: 0 }),
		favoriteCount: Type.Integer({ minimum: 0 }),
		downloadCount: Type.Integer({ minimum: 0 }),
		createdAt: Type.String({ format: 'date-time' }),
	},
	{
		$id: 'ModelSummary',
		description: '模型摘要信息',
	},
);

/**
 * 创建模型请求 Schema
 */
export const CreateModelInput = Type.Object(
	{
		imageId: Type.String({ description: '选择的图片 ID' }),
	},
	{
		$id: 'CreateModelInput',
		description: '创建 3D 模型请求',
	},
);

/**
 * 类型推导
 */
export type ModelEntityType = Static<typeof ModelEntity>;
export type ModelSummaryType = Static<typeof ModelSummary>;
export type CreateModelInputType = Static<typeof CreateModelInput>;
