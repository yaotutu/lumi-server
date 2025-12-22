/**
 * Task (Generation Request) 实体 Schema
 * 与数据库 generation_requests 表对应
 */

import { type Static, Type } from '@sinclair/typebox';
import { RequestPhaseEnum, RequestStatusEnum } from './enums.schema';
import { ImageEntity } from './image.entity.schema';
import { ModelEntity } from './model.entity.schema';

/**
 * 生成请求基础 Schema (不含关联)
 */
export const TaskEntity = Type.Object(
	{
		id: Type.String({ description: '任务 ID' }),
		externalUserId: Type.String({ description: '外部用户 ID' }),
		prompt: Type.String({ description: '提示词' }),
		status: RequestStatusEnum,
		phase: RequestPhaseEnum,
		selectedImageIndex: Type.Union([Type.Integer({ minimum: 0, maximum: 3 }), Type.Null()], {
			description: '用户选择的图片索引 (0-3)',
		}),
		createdAt: Type.String({ format: 'date-time', description: '创建时间' }),
		updatedAt: Type.String({ format: 'date-time', description: '更新时间' }),
		completedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()], {
			description: '完成时间',
		}),
	},
	{
		$id: 'TaskEntity',
		description: '生成任务实体',
	},
);

/**
 * 生成请求扩展 Schema (带关联的图片)
 * 用于详情接口
 */
export const TaskWithImages = Type.Intersect(
	[
		TaskEntity,
		Type.Object({
			images: Type.Array(ImageEntity, {
				description: '关联的图片列表 (最多 4 张)',
			}),
		}),
	],
	{
		$id: 'TaskWithImages',
		description: '包含图片的生成任务',
	},
);

/**
 * 生成请求完整 Schema (带图片和模型)
 * 用于完整详情接口
 */
export const TaskComplete = Type.Intersect(
	[
		TaskEntity,
		Type.Object({
			images: Type.Array(ImageEntity, {
				description: '关联的图片列表',
			}),
			model: Type.Union([ModelEntity, Type.Null()], {
				description: '关联的 3D 模型（如有）',
			}),
		}),
	],
	{
		$id: 'TaskComplete',
		description: '包含完整关联的生成任务',
	},
);

/**
 * 创建任务请求 Schema
 */
export const CreateTaskInput = Type.Object(
	{
		prompt: Type.String({
			minLength: 1,
			maxLength: 500,
			description: '生成提示词 (1-500 字符)',
		}),
	},
	{
		$id: 'CreateTaskInput',
		description: '创建任务请求',
	},
);

/**
 * 选择图片请求 Schema
 */
export const SelectImageInput = Type.Object(
	{
		imageIndex: Type.Integer({
			minimum: 0,
			maximum: 3,
			description: '选择的图片索引 (0-3)',
		}),
	},
	{
		$id: 'SelectImageInput',
		description: '选择图片请求',
	},
);

/**
 * 类型推导
 */
export type TaskEntityType = Static<typeof TaskEntity>;
export type TaskWithImagesType = Static<typeof TaskWithImages>;
export type TaskCompleteType = Static<typeof TaskComplete>;
export type CreateTaskInputType = Static<typeof CreateTaskInput>;
export type SelectImageInputType = Static<typeof SelectImageInput>;
