/**
 * Fastify 类型扩展
 * 为 FastifyRequest 添加 user 属性，用于存储认证后的用户信息
 */

declare module 'fastify' {
	interface FastifyRequest {
		/**
		 * 当前认证用户信息
		 * 由 authMiddleware 设置，仅在受保护的路由中存在
		 */
		user?: {
			id: string; // 用户 ID
			email: string; // 用户邮箱
			userName: string; // 用户名
		};
	}
}

// 确保这是一个模块
export {};
