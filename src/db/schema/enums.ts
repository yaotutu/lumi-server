import { mysqlEnum } from 'drizzle-orm/mysql-core';

/**
 * 枚举定义
 * 与 Prisma Schema 保持一致
 */

// 请求状态
export const requestStatusEnum = mysqlEnum('request_status', [
	'IMAGE_PENDING',
	'IMAGE_GENERATING',
	'IMAGE_COMPLETED',
	'IMAGE_FAILED',
	'MODEL_PENDING',
	'MODEL_GENERATING',
	'MODEL_COMPLETED',
	'MODEL_FAILED',
	'COMPLETED',
	'FAILED',
	'CANCELLED',
]);

export type RequestStatus =
	| 'IMAGE_PENDING'
	| 'IMAGE_GENERATING'
	| 'IMAGE_COMPLETED'
	| 'IMAGE_FAILED'
	| 'MODEL_PENDING'
	| 'MODEL_GENERATING'
	| 'MODEL_COMPLETED'
	| 'MODEL_FAILED'
	| 'COMPLETED'
	| 'FAILED'
	| 'CANCELLED';

// 请求阶段
export const requestPhaseEnum = mysqlEnum('request_phase', [
	'IMAGE_GENERATION',
	'AWAITING_SELECTION',
	'MODEL_GENERATION',
	'COMPLETED',
]);

export type RequestPhase =
	| 'IMAGE_GENERATION'
	| 'AWAITING_SELECTION'
	| 'MODEL_GENERATION'
	| 'COMPLETED';

// 图片状态
export const imageStatusEnum = mysqlEnum('image_status', [
	'PENDING',
	'GENERATING',
	'COMPLETED',
	'FAILED',
]);

export type ImageStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';

// Job状态
export const jobStatusEnum = mysqlEnum('job_status', [
	'PENDING',
	'RUNNING',
	'RETRYING',
	'COMPLETED',
	'FAILED',
	'CANCELLED',
	'TIMEOUT',
]);

export type JobStatus =
	| 'PENDING'
	| 'RUNNING'
	| 'RETRYING'
	| 'COMPLETED'
	| 'FAILED'
	| 'CANCELLED'
	| 'TIMEOUT';

// 模型来源
export const modelSourceEnum = mysqlEnum('model_source', ['AI_GENERATED', 'USER_UPLOADED']);

export type ModelSource = 'AI_GENERATED' | 'USER_UPLOADED';

// 模型可见性
export const modelVisibilityEnum = mysqlEnum('model_visibility', ['PRIVATE', 'PUBLIC']);

export type ModelVisibility = 'PRIVATE' | 'PUBLIC';

// 交互类型
export const interactionTypeEnum = mysqlEnum('interaction_type', ['LIKE', 'FAVORITE']);

export type InteractionType = 'LIKE' | 'FAVORITE';

// 打印状态
export const printStatusEnum = mysqlEnum('print_status', [
	'NOT_STARTED',
	'SLICING',
	'SLICE_COMPLETE',
	'PRINTING',
	'PRINT_COMPLETE',
	'FAILED',
]);

export type PrintStatus =
	| 'NOT_STARTED'
	| 'SLICING'
	| 'SLICE_COMPLETE'
	| 'PRINTING'
	| 'PRINT_COMPLETE'
	| 'FAILED';

// 切片状态（独立于打印状态）
export const sliceStatusEnum = mysqlEnum('slice_status', [
	'PENDING',
	'PROCESSING',
	'COMPLETED',
	'FAILED',
]);

export type SliceStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
