/**
 * Task（生成请求）相关的 Schema 定义
 */

import { createSuccessResponseSchema } from './common.schema';

/**
 * 任务状态枚举
 */
export const taskStatusEnum = [
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
] as const;

/**
 * 任务阶段枚举
 */
export const taskPhaseEnum = [
	'IMAGE_GENERATION',
	'AWAITING_SELECTION',
	'MODEL_GENERATION',
	'COMPLETED',
] as const;

/**
 * 打印状态枚举
 */
export const printStatusEnum = [
	'NOT_STARTED',
	'SLICING',
	'SLICE_COMPLETE',
	'PRINTING',
	'PRINT_COMPLETE',
	'FAILED',
] as const;

/**
 * 图片生成任务 Schema（嵌套在 taskSchema 中）
 */
const imageSchema = {
	type: 'object',
	properties: {
		id: { type: 'string', description: '图片 ID' },
		requestId: { type: 'string', description: '关联的任务 ID' },
		index: { type: 'integer', minimum: 0, maximum: 3, description: '图片索引（0-3）' },
		imageUrl: { type: ['string', 'null'], description: '图片 URL' },
		imagePrompt: { type: ['string', 'null'], description: '图片生成提示词' },
		imageStatus: { type: 'string', description: '图片生成状态' },
		createdAt: { type: 'string', format: 'date-time', description: '创建时间' },
		completedAt: { type: ['string', 'null'], format: 'date-time', description: '完成时间' },
		failedAt: { type: ['string', 'null'], format: 'date-time', description: '失败时间' },
		errorMessage: { type: ['string', 'null'], description: '错误信息' },
		generationJob: {
			type: ['object', 'null'],
			properties: {
				id: { type: 'string', description: '任务 ID' },
				status: { type: 'string', description: '任务状态' },
				retryCount: { type: 'integer', description: '重试次数' },
			},
		},
	},
} as const;

/**
 * 3D 模型 Schema（嵌套在 taskSchema 中）
 */
const modelSchema = {
	type: ['object', 'null'],
	properties: {
		id: { type: 'string', description: '模型 ID' },
		requestId: { type: 'string', description: '关联的任务 ID' },
		modelUrl: { type: ['string', 'null'], description: '模型文件 URL' },
		previewImageUrl: { type: ['string', 'null'], description: '预览图 URL' },
		format: { type: ['string', 'null'], description: '模型格式' },
		completedAt: { type: ['string', 'null'], format: 'date-time', description: '完成时间' },
		generationJob: {
			type: ['object', 'null'],
			properties: {
				id: { type: 'string', description: '任务 ID' },
				status: { type: 'string', description: '任务状态' },
				progress: { type: 'integer', minimum: 0, maximum: 100, description: '进度百分比' },
			},
		},
	},
} as const;

/**
 * 任务对象 Schema（包含关联的 images 和 model）
 */
export const taskSchema = {
	type: 'object',
	properties: {
		id: { type: 'string', description: '任务 ID' },
		userId: { type: 'string', description: '用户 ID' },
		prompt: { type: 'string', description: '生成提示词' },
		status: { type: 'string', enum: taskStatusEnum, description: '任务状态' },
		phase: { type: 'string', enum: taskPhaseEnum, description: '任务阶段' },
		selectedImageIndex: {
			type: ['integer', 'null'],
			minimum: 0,
			maximum: 3,
			description: '选择的图片索引（0-3）',
		},
		createdAt: { type: 'string', format: 'date-time', description: '创建时间' },
		updatedAt: { type: 'string', format: 'date-time', description: '更新时间' },
		completedAt: { type: ['string', 'null'], format: 'date-time', description: '完成时间' },
		images: {
			type: 'array',
			items: imageSchema,
			description: '关联的图片列表（4 张）',
		},
		model: modelSchema,
	},
} as const;

/**
 * POST /api/tasks - 创建任务
 */
export const createTaskSchema = {
	tags: ['任务'],
	summary: '创建生成任务',
	description: '创建一个新的图片/模型生成任务，会自动创建4个图片生成子任务',
	body: {
		type: 'object',
		required: ['prompt'],
		properties: {
			prompt: {
				type: 'string',
				minLength: 1,
				maxLength: 500,
				description: '生成提示词（1-500字符）',
			},
			optimizePrompt: {
				type: 'boolean',
				default: true,
				description: '是否优化提示词',
			},
		},
	},
	response: {
		201: createSuccessResponseSchema(taskSchema),
		400: {
			description: '请求参数错误',
			type: 'object',
			properties: {
				status: { type: 'string', enum: ['fail'] },
				data: {
					type: 'object',
					properties: {
						message: { type: 'string' },
					},
				},
			},
		},
	},
} as const;

/**
 * GET /api/tasks - 获取任务列表
 */
export const listTasksSchema = {
	tags: ['任务'],
	summary: '获取任务列表',
	description: '获取当前用户的所有生成任务',
	querystring: {
		type: 'object',
		properties: {
			limit: {
				type: 'integer',
				minimum: 1,
				maximum: 100,
				default: 20,
				description: '每页数量',
			},
		},
	},
	response: {
		200: createSuccessResponseSchema({
			type: 'object',
			properties: {
				items: {
					type: 'array',
					items: taskSchema,
					description: '任务列表',
				},
				total: {
					type: 'integer',
					minimum: 0,
					description: '总数量',
				},
			},
		}),
	},
} as const;

/**
 * GET /api/tasks/:id - 获取任务详情
 */
export const getTaskSchema = {
	tags: ['任务'],
	summary: '获取任务详情',
	description: '根据 ID 获取单个任务的详细信息',
	params: {
		type: 'object',
		required: ['id'],
		properties: {
			id: { type: 'string', description: '任务 ID' },
		},
	},
	response: {
		200: createSuccessResponseSchema(taskSchema),
		404: {
			description: '任务不存在',
			type: 'object',
			properties: {
				status: { type: 'string', enum: ['fail'] },
				data: {
					type: 'object',
					properties: {
						message: { type: 'string' },
					},
				},
			},
		},
	},
} as const;

/**
 * PATCH /api/tasks/:id - 选择图片触发3D生成
 */
export const selectImageSchema = {
	tags: ['任务'],
	summary: '选择图片触发 3D 生成',
	description: '从 4 张生成的图片中选择一张，触发 3D 模型生成',
	params: {
		type: 'object',
		required: ['id'],
		properties: {
			id: { type: 'string', description: '任务 ID' },
		},
	},
	body: {
		type: 'object',
		required: ['selectedImageIndex'],
		properties: {
			selectedImageIndex: {
				type: 'integer',
				minimum: 0,
				maximum: 3,
				description: '选择的图片索引（0-3）',
			},
		},
	},
	response: {
		200: createSuccessResponseSchema({
			type: 'object',
			properties: {
				model: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						name: { type: 'string' },
						previewImageUrl: { type: 'string' },
					},
				},
				selectedImageIndex: { type: 'integer' },
			},
		}),
		400: {
			description: '请求参数错误或任务状态不符合',
		},
		404: {
			description: '任务不存在',
		},
	},
} as const;

/**
 * DELETE /api/tasks/:id - 删除任务
 */
export const deleteTaskSchema = {
	tags: ['任务'],
	summary: '删除任务',
	description: '删除指定的生成任务及其所有相关资源',
	params: {
		type: 'object',
		required: ['id'],
		properties: {
			id: { type: 'string', description: '任务 ID' },
		},
	},
	response: {
		200: createSuccessResponseSchema({
			type: 'object',
			properties: {
				message: { type: 'string' },
			},
		}),
		403: {
			description: '无权限删除此任务',
		},
		404: {
			description: '任务不存在',
		},
	},
} as const;

/**
 * POST /api/tasks/:id/print - 提交打印任务
 */
export const submitPrintSchema = {
	tags: ['任务'],
	summary: '提交打印任务',
	description: '将生成的 3D 模型提交到打印服务',
	params: {
		type: 'object',
		required: ['id'],
		properties: {
			id: { type: 'string', description: '任务 ID' },
		},
	},
	response: {
		200: createSuccessResponseSchema({
			type: 'object',
			properties: {
				sliceTaskId: { type: 'string', description: '切片任务 ID' },
				printResult: {
					type: 'object',
					properties: {
						status: { type: 'string' },
						message: { type: 'string' },
					},
				},
				message: { type: 'string' },
			},
		}),
		400: {
			description: '模型未完成或不符合打印条件',
		},
		404: {
			description: '任务不存在',
		},
	},
} as const;

/**
 * GET /api/tasks/:id/print-status - 查询打印状态
 */
export const getPrintStatusSchema = {
	tags: ['任务'],
	summary: '查询打印状态',
	description: '查询 3D 模型的打印进度和状态',
	params: {
		type: 'object',
		required: ['id'],
		properties: {
			id: { type: 'string', description: '任务 ID' },
		},
	},
	response: {
		200: createSuccessResponseSchema({
			type: 'object',
			properties: {
				printStatus: {
					type: 'string',
					enum: printStatusEnum,
					description: '打印状态',
				},
				sliceTaskId: { type: 'string', description: '切片任务 ID' },
				progress: {
					type: 'integer',
					minimum: 0,
					maximum: 100,
					description: '进度百分比',
				},
			},
		}),
		400: {
			description: '尚未提交打印任务',
		},
		404: {
			description: '任务不存在',
		},
	},
} as const;
