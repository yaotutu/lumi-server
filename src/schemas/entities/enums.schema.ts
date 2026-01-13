/**
 * 枚举类型 Schema (TypeBox 版本)
 * 与数据库枚举保持一致
 */

import { Type } from '@sinclair/typebox';

/**
 * 请求状态枚举
 */
export const RequestStatusEnum = Type.Union(
	[
		Type.Literal('IMAGE_PENDING'),
		Type.Literal('IMAGE_GENERATING'),
		Type.Literal('IMAGE_COMPLETED'),
		Type.Literal('IMAGE_FAILED'),
		Type.Literal('MODEL_PENDING'),
		Type.Literal('MODEL_GENERATING'),
		Type.Literal('MODEL_COMPLETED'),
		Type.Literal('MODEL_FAILED'),
		Type.Literal('COMPLETED'),
		Type.Literal('FAILED'),
		Type.Literal('CANCELLED'),
	],
	{
		$id: 'RequestStatus',
		description: '请求状态',
	},
);

/**
 * 请求阶段枚举
 */
export const RequestPhaseEnum = Type.Union(
	[
		Type.Literal('IMAGE_GENERATION'),
		Type.Literal('AWAITING_SELECTION'),
		Type.Literal('MODEL_GENERATION'),
		Type.Literal('COMPLETED'),
	],
	{
		$id: 'RequestPhase',
		description: '请求阶段',
	},
);

/**
 * 图片状态枚举
 */
export const ImageStatusEnum = Type.Union(
	[
		Type.Literal('PENDING'),
		Type.Literal('GENERATING'),
		Type.Literal('COMPLETED'),
		Type.Literal('FAILED'),
	],
	{
		$id: 'ImageStatus',
		description: '图片状态',
	},
);

/**
 * Job 状态枚举
 */
export const JobStatusEnum = Type.Union(
	[
		Type.Literal('PENDING'),
		Type.Literal('RUNNING'),
		Type.Literal('RETRYING'),
		Type.Literal('COMPLETED'),
		Type.Literal('FAILED'),
		Type.Literal('CANCELLED'),
		Type.Literal('TIMEOUT'),
	],
	{
		$id: 'JobStatus',
		description: 'Job 状态',
	},
);

/**
 * 模型来源枚举
 */
export const ModelSourceEnum = Type.Union(
	[Type.Literal('AI_GENERATED'), Type.Literal('USER_UPLOADED')],
	{
		$id: 'ModelSource',
		description: '模型来源',
	},
);

/**
 * 模型可见性枚举
 */
export const ModelVisibilityEnum = Type.Union([Type.Literal('PRIVATE'), Type.Literal('PUBLIC')], {
	$id: 'ModelVisibility',
	description: '模型可见性',
});

/**
 * 交互类型枚举
 */
export const InteractionTypeEnum = Type.Union([Type.Literal('LIKE'), Type.Literal('FAVORITE')], {
	$id: 'InteractionType',
	description: '交互类型',
});

/**
 * 打印状态枚举
 */
export const PrintStatusEnum = Type.Union(
	[
		Type.Literal('NOT_STARTED'),
		Type.Literal('SLICING'),
		Type.Literal('SLICE_COMPLETE'),
		Type.Literal('PRINTING'),
		Type.Literal('PRINT_COMPLETE'),
		Type.Literal('FAILED'),
	],
	{
		$id: 'PrintStatus',
		description: '打印状态',
	},
);
