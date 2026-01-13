/**
 * Proxy 路由 Schema (TypeBox 版本)
 * 对应 /api/proxy 相关端点（资源代理）
 */

import { Type } from '@sinclair/typebox';

/**
 * GET /api/proxy/image - 图片代理
 */
export const proxyImageSchema = {
	tags: ['代理'],
	summary: '图片代理',
	description: '通过服务端代理访问图片资源（解决跨域问题）',
	querystring: Type.Object({
		url: Type.String({ format: 'uri', description: '原始图片 URL' }),
	}),
	response: {
		200: Type.Object(
			{},
			{
				description: '图片二进制数据',
				headers: Type.Object({
					'content-type': Type.String({ description: '图片 MIME 类型' }),
					'cache-control': Type.String(),
				}),
			},
		),
	},
} as const;

/**
 * GET /api/proxy/model - 模型代理
 */
export const proxyModelSchema = {
	tags: ['代理'],
	summary: '模型文件代理',
	description: '通过服务端代理访问 3D 模型文件（解决跨域问题）',
	querystring: Type.Object({
		url: Type.String({ format: 'uri', description: '原始模型文件 URL' }),
	}),
	response: {
		200: Type.Object(
			{},
			{
				description: '模型文件二进制数据',
				headers: Type.Object({
					'content-type': Type.String({ description: '文件 MIME 类型' }),
					'cache-control': Type.String(),
				}),
			},
		),
	},
} as const;
