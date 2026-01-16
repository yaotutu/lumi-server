/**
 * 模型管理相关的 API 路由
 * 处理模型的创建、查询、更新、删除等操作
 */

import type { FastifyInstance } from 'fastify';
import {
	downloadModelSchema,
	getModelSchema,
	listModelsSchema,
} from '@/schemas/routes/models.schema';
import * as ModelService from '@/services/model.service';
import { NotFoundError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { error as errorResponse, fail, success } from '@/utils/response';

/**
 * 注册模型管理路由
 */
export async function galleryModelRoutes(fastify: FastifyInstance) {
	/**
	 * GET /api/gallery/models
	 * 获取公开模型列表
	 */
	fastify.get('/api/gallery/models', { schema: listModelsSchema }, async (request, reply) => {
		try {
			const query = request.query as {
				sort?: string;
				limit?: string;
				offset?: string;
			};

			const sortBy = (query.sort || 'latest') as 'latest' | 'popular' | 'liked';
			const limit = Number.parseInt(query.limit || '20', 10);
			const offset = Number.parseInt(query.offset || '0', 10);

			const models = await ModelService.getPublicModels({ sortBy, limit, offset });

			return reply.send(success(models));
		} catch (error) {
			logger.error({ msg: '获取公开模型列表失败', error });
			return reply.status(500).send(errorResponse('获取公开模型列表失败', 'INTERNAL_ERROR'));
		}
	});

	/**
	 * GET /api/gallery/models/:id
	 * 获取模型详情（自动增加浏览计数）
	 */
	fastify.get<{ Params: { id: string } }>(
		'/api/gallery/models/:id',
		{ schema: getModelSchema },
		async (request, reply) => {
			try {
				const { id } = request.params;

				const model = await ModelService.getModelById(id);

				// 异步增加浏览计数（不阻塞响应）
				ModelService.incrementViewCount(id).catch((error) => {
					logger.error({ msg: '增加浏览计数失败', error, modelId: id });
				});

				return reply.send(success(model));
			} catch (error) {
				logger.error({ msg: '获取模型详情失败', error, modelId: request.params.id });

				// ✅ 统一错误处理：使用自定义错误类（替代字符串匹配）
				if (error instanceof NotFoundError) {
					return reply.status(404).send(fail(error.message, error.code));
				}
				return reply.status(500).send(errorResponse('获取模型详情失败', 'INTERNAL_ERROR'));
			}
		},
	);

	/**
	 * POST /api/gallery/models/:id/download
	 * 增加下载计数
	 */
	fastify.post<{ Params: { id: string } }>(
		'/api/gallery/models/:id/download',
		{ schema: downloadModelSchema },
		async (request, reply) => {
			try {
				const { id } = request.params;

				await ModelService.incrementDownloadCount(id);

				logger.info({ msg: '✅ 模型下载计数+1', modelId: id });

				return reply.send(success({ message: '下载成功' }));
			} catch (error) {
				logger.error({ msg: '增加下载计数失败', error, modelId: request.params.id });

				// ✅ 统一错误处理：使用自定义错误类（替代字符串匹配）
				if (error instanceof NotFoundError) {
					return reply.status(404).send(fail(error.message, error.code));
				}
				return reply.status(500).send(errorResponse('增加下载计数失败', 'INTERNAL_ERROR'));
			}
		},
	);
}
