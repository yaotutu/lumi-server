/**
 * Interaction 实体 Schema
 * 与数据库 model_interactions 表对应
 */

import { type Static, Type } from '@sinclair/typebox';
import { InteractionTypeEnum } from './enums.schema';

/**
 * 模型交互实体 Schema
 */
export const InteractionEntity = Type.Object(
	{
		id: Type.String({ description: '交互 ID' }),
		externalUserId: Type.String({ description: '用户 ID' }),
		modelId: Type.String({ description: '模型 ID' }),
		type: InteractionTypeEnum,
		createdAt: Type.String({ format: 'date-time', description: '创建时间' }),
	},
	{
		$id: 'InteractionEntity',
		description: '模型交互实体',
	},
);

/**
 * 创建交互请求 Schema
 */
export const CreateInteractionInput = Type.Object(
	{
		type: InteractionTypeEnum,
	},
	{
		$id: 'CreateInteractionInput',
		description: '创建交互请求',
	},
);

/**
 * 批量创建交互请求 Schema
 */
export const BatchCreateInteractionsInput = Type.Object(
	{
		modelIds: Type.Array(Type.String(), {
			minItems: 1,
			maxItems: 100,
			description: '模型 ID 列表 (1-100 个)',
		}),
		type: InteractionTypeEnum,
	},
	{
		$id: 'BatchCreateInteractionsInput',
		description: '批量创建交互请求',
	},
);

/**
 * 用户对模型的交互状态 Schema
 */
export const UserModelInteractions = Type.Object(
	{
		modelId: Type.String({ description: '模型 ID' }),
		hasLiked: Type.Boolean({ description: '是否已点赞' }),
		hasFavorited: Type.Boolean({ description: '是否已收藏' }),
	},
	{
		$id: 'UserModelInteractions',
		description: '用户对模型的交互状态',
	},
);

/**
 * 类型推导
 */
export type InteractionEntityType = Static<typeof InteractionEntity>;
export type CreateInteractionInputType = Static<typeof CreateInteractionInput>;
export type BatchCreateInteractionsInputType = Static<typeof BatchCreateInteractionsInput>;
export type UserModelInteractionsType = Static<typeof UserModelInteractions>;
