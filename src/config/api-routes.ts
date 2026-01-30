/**
 * API 路由配置 - 统一管理所有 API 的认证规则
 *
 * 架构设计：
 * - 一个对象，三个数组，清晰明了
 * - 使用路径模板（:id）代替正则表达式，更易读
 * - 新增 API 只需在对应数组中添加配置即可
 *
 * 路径模板语法：
 * - /api/tasks/:id - 匹配 /api/tasks/123
 * - /api/gallery/models/:id/interactions - 匹配 /api/gallery/models/abc/interactions
 * - /api/admin/* - 匹配 /api/admin/ 下的所有路径（使用 startsWith）
 */

/**
 * 受保护的路由方法配置
 */
interface ProtectedMethodRule {
	path: string;
	methods: string[];
}

/**
 * API 路由配置
 */
export const API_ROUTES = {
	/**
	 * 完全受保护的 API（所有方法都需要登录）
	 * - Middleware 拦截
	 * - API 使用 request.user 对象获取用户信息
	 */
	protected: [
		'/api/tasks', // 任务管理（包括所有子路径）
		'/api/users', // 用户相关接口（包括所有子路径）
		'/api/models', // 模型管理（包括所有子路径）
		'/api/admin', // 管理接口（包括所有子路径）
		'/api/printer', // 打印机管理（包括所有子路径：list, bind, unbind, detail）
		'/api/devices', // 设备管理（包括所有子路径：products）
	],

	/**
	 * 方法级保护（特定方法需要登录）
	 * - Middleware 根据方法拦截
	 * - API 使用 request.user 对象获取用户信息
	 *
	 * 使用路径模板：:id 表示动态参数
	 */
	protectedByMethod: [
		{
			path: '/api/gallery/models/:id/interactions', // 使用 :id 代替正则
			methods: ['POST', 'PUT', 'DELETE'], // 仅 POST/PUT/DELETE 需要认证（点赞/收藏操作）
			// GET 方法不需要认证，允许已登录和未登录用户访问
		},
		{
			path: '/api/gallery/models/:id/download', // 模型下载
			methods: ['GET', 'POST'],
		},
		// 🔥 移除 batch-interactions 的保护配置，改为可选认证（支持未登录访问）
	] as ProtectedMethodRule[],

	/**
	 * 公开 API（不需要登录）
	 * - Middleware 直接放行
	 * - 某些 API 内部可能使用 request.user 对象区分登录状态
	 */
	public: [
		'/api/auth/', // 认证相关（登录、退出、获取用户信息）
		'/api/proxy/', // 代理服务（图片、模型）
		'/api/openapi', // API 文档
		'/api/gallery/', // 画廊浏览（包括查询交互状态）
		'/api/workers/status', // Worker 状态
		'/api/health', // 健康检查
		'/api/test/', // 测试接口（开发环境）
	],
};

/**
 * 检查路径是否匹配模式
 */
function matchesPattern(pathname: string, pattern: string | RegExp): boolean {
	if (typeof pattern === 'string') {
		return pathname === pattern || pathname.startsWith(pattern);
	}
	return pattern.test(pathname);
}

/**
 * 检查路径是否匹配路径模板
 * 支持 :id 语法，例如：
 * - 模板 "/api/gallery/models/:id/interactions"
 * - 匹配 "/api/gallery/models/123/interactions"
 *
 * @param pathname - 实际请求路径
 * @param template - 路径模板（使用 :id 表示动态参数）
 * @returns 是否匹配
 */
function matchPathTemplate(pathname: string, template: string): boolean {
	// 分割路径段（过滤掉空字符串）
	const pathSegments = pathname.split('/').filter(Boolean);
	const templateSegments = template.split('/').filter(Boolean);

	// 段数不一致，直接返回 false
	if (pathSegments.length !== templateSegments.length) {
		return false;
	}

	// 逐段比较
	for (let i = 0; i < templateSegments.length; i++) {
		const templateSeg = templateSegments[i];
		const pathSeg = pathSegments[i];

		// 如果是动态参数（以 : 开头），跳过比较
		if (templateSeg.startsWith(':')) {
			continue;
		}

		// 静态段必须完全匹配
		if (templateSeg !== pathSeg) {
			return false;
		}
	}

	return true;
}

/**
 * 检查路径和方法是否需要认证
 *
 * @param pathname - 请求路径
 * @param method - HTTP 方法
 * @returns 是否需要认证
 */
export function isProtectedRoute(pathname: string, method: string): boolean {
	// 1. 优先检查公开 API（白名单优先）
	for (const pattern of API_ROUTES.public) {
		// 支持路径模板（例如 /api/tasks/:id/status）
		if (pattern.includes(':')) {
			if (matchPathTemplate(pathname, pattern)) {
				// 进一步检查是否有特定方法的保护规则
				for (const rule of API_ROUTES.protectedByMethod) {
					if (matchPathTemplate(pathname, rule.path) && rule.methods.includes(method)) {
						return true; // 虽然路径是公开的，但特定方法需要认证
					}
				}
				return false; // 公开 API
			}
		} else {
			// 普通路径（使用 startsWith）
			if (matchesPattern(pathname, pattern)) {
				// 进一步检查是否有特定方法的保护规则
				for (const rule of API_ROUTES.protectedByMethod) {
					if (matchPathTemplate(pathname, rule.path) && rule.methods.includes(method)) {
						return true; // 虽然路径是公开的，但特定方法需要认证
					}
				}
				return false; // 公开 API
			}
		}
	}

	// 2. 检查完全受保护的 API
	for (const pattern of API_ROUTES.protected) {
		if (matchesPattern(pathname, pattern)) {
			return true; // 需要认证
		}
	}

	// 3. 默认不拦截
	// 注意：为了向后兼容，暂时保持默认不拦截
	// TODO: 未来应改为白名单模式（默认需要认证）
	return false;
}
