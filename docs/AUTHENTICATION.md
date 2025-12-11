# 认证系统实现文档

## 概述

Lumi Server 实现了与 Next.js 应用完全一致的 Cookie-based 认证系统，通过 Fastify 中间件统一拦截需要认证的 API 请求。

## 架构设计

### 核心原则

1. **统一认证拦截**：所有认证逻辑集中在 `authMiddleware` 中，避免在每个路由处理器中重复验证
2. **请求头传递用户信息**：认证成功后通过 `x-user-id` 和 `x-user-email` 请求头传递用户信息
3. **路由级别的访问控制**：基于路径和 HTTP 方法的细粒度权限控制
4. **JSend 响应格式**：401 错误统一使用 JSend 格式返回

### 认证流程

```
客户端请求
    ↓
[authMiddleware]
    ↓
检查路径是否需要认证？
    ├─ 否 → 直接放行
    └─ 是 → 验证 Cookie
           ├─ 有效 → 设置请求头 (x-user-id, x-user-email) → 继续处理
           └─ 无效 → 返回 401 Unauthorized
```

## 核心组件

### 1. API 路由配置 (`src/config/api-routes.ts`)

定义了三类 API 路由：

#### 完全受保护的 API
所有 HTTP 方法都需要认证：
```typescript
protected: [
  '/api/tasks',    // 任务管理（包括所有子路径）
  '/api/admin',    // 管理接口
]
```

#### 方法级保护的 API
特定 HTTP 方法需要认证：
```typescript
protectedByMethod: [
  {
    path: '/api/gallery/models/:id/interactions',
    methods: ['POST', 'PUT', 'DELETE'],  // 点赞/收藏操作
  },
  {
    path: '/api/gallery/models/:id/download',
    methods: ['GET', 'POST'],  // 模型下载
  },
]
```

#### 公开 API
不需要认证：
```typescript
public: [
  '/api/auth/',         // 认证相关（登录、登出）
  '/api/proxy/',        // 代理服务
  '/api/openapi',       // API 文档
  '/api/gallery/',      // 画廊浏览
  '/api/workers/status', // Worker 状态
]
```

### 2. 认证中间件 (`src/middleware/auth.middleware.ts`)

#### Cookie 名称
```typescript
const AUTH_COOKIE_NAME = 'auth-session';
```

#### Cookie 数据结构
```typescript
interface UserSession {
  userId: string;
  email: string;
}
```

#### 中间件逻辑

1. **路径过滤**：只拦截 `/api/*` 路径
2. **路由检查**：使用 `isProtectedRoute()` 判断是否需要认证
3. **Cookie 验证**：解析并验证 `auth-session` Cookie
4. **请求头设置**：认证成功后设置 `x-user-id` 和 `x-user-email`
5. **错误响应**：认证失败返回 401 + JSend 格式

### 3. 应用注册 (`src/app.ts`)

```typescript
// 认证中间件（必须在路由之前注册）
app.addHook('onRequest', authMiddleware);
```

**注意**：认证中间件必须在路由注册之前添加，这样才能拦截所有请求。

## 使用方式

### 路由处理器中获取用户信息

所有受保护的路由处理器可以直接从请求头获取用户信息：

```typescript
fastify.get('/api/tasks', async (request, reply) => {
  // 从认证中间件设置的请求头获取用户 ID
  const userId = request.headers['x-user-id'] as string;

  // 注意：受保护的路由保证 userId 一定存在
  // 不需要额外验证

  const tasks = await TaskService.listTasks(userId);
  return reply.send(success(tasks));
});
```

### 前端发送认证请求

前端需要在 Cookie 中包含有效的 `auth-session`：

```typescript
// 登录后设置 Cookie
document.cookie = `auth-session=${JSON.stringify({
  userId: 'user-123',
  email: 'user@example.com'
})}; path=/`;

// 发送请求（浏览器自动携带 Cookie）
fetch('http://localhost:3001/api/tasks', {
  credentials: 'include',  // 重要：携带 Cookie
});
```

### curl 测试示例

#### 未认证访问受保护 API
```bash
curl http://localhost:3001/api/tasks
# 响应：401 Unauthorized
# {
#   "status": "fail",
#   "data": {
#     "message": "请先登录",
#     "code": "UNAUTHORIZED"
#   }
# }
```

#### 带认证 Cookie 访问
```bash
curl -b "auth-session={\"userId\":\"test-user\",\"email\":\"test@example.com\"}" \
  http://localhost:3001/api/tasks
# 响应：200 OK
# {
#   "status": "success",
#   "data": { "items": [...], "total": 10 }
# }
```

#### SSE 连接
```bash
curl -N -b "auth-session={\"userId\":\"test-user\",\"email\":\"test@example.com\"}" \
  http://localhost:3001/api/tasks/abc123/events
# 响应：SSE 流
# event: task:init
# data: {"id":"abc123",...}
```

## 安全考虑

### Cookie 安全设置

生产环境应配置以下 Cookie 属性：

```typescript
reply.setCookie('auth-session', sessionData, {
  httpOnly: true,      // 防止 JavaScript 访问
  secure: true,        // 仅 HTTPS 传输
  sameSite: 'strict',  // 防止 CSRF 攻击
  maxAge: 86400,       // 24 小时过期
  path: '/',
});
```

### CORS 配置

确保 CORS 允许凭证传递：

```typescript
await app.register(cors, {
  origin: 'https://your-frontend-domain.com',
  credentials: true,  // 允许携带 Cookie
});
```

### Session 持久化

当前实现使用 Cookie 存储会话信息（仅包含 userId 和 email），生产环境建议：

1. 使用 Session ID 而不是直接存储用户信息
2. Session 数据存储在 Redis 中
3. 定期刷新 Session 过期时间
4. 实现会话失效机制

## 与 Next.js 的兼容性

本实现与 Next.js 版本完全兼容：

| 特性 | Next.js | Fastify |
|-----|---------|---------|
| Cookie 名称 | `auth-session` | `auth-session` ✅ |
| Cookie 结构 | `{userId, email}` | `{userId, email}` ✅ |
| 受保护路由 | `/api/tasks` | `/api/tasks` ✅ |
| 401 响应格式 | JSend | JSend ✅ |
| 请求头传递 | `x-user-id` | `x-user-id` ✅ |
| SSE 认证 | 支持 | 支持 ✅ |

## 测试验证

### 测试场景

- ✅ 未认证访问受保护 API 返回 401
- ✅ 带有效 Cookie 访问受保护 API 返回 200
- ✅ 公开 API 无需认证即可访问
- ✅ SSE 端点需要认证
- ✅ 带认证的 SSE 连接正常工作
- ✅ 请求头正确设置 `x-user-id` 和 `x-user-email`

### 测试日志示例

```
[WARN] 未认证访问受保护的 API
  pathname: "/api/tasks"
  method: "GET"

[INFO] incoming request
  reqId: "req-1"
  req: {"method":"GET","url":"/api/tasks"}

[INFO] request completed
  reqId: "req-1"
  res: {"statusCode":401}
```

## 故障排查

### 问题：前端总是收到 401

**可能原因**：
1. Cookie 未正确设置或已过期
2. Cookie 的 domain 或 path 配置错误
3. CORS 未配置 `credentials: true`
4. 浏览器隐私模式阻止 Cookie

**解决方法**：
- 检查浏览器开发者工具的 Application/Cookie 选项卡
- 确认 Cookie 名称为 `auth-session`
- 验证 Cookie 值是否为有效 JSON
- 检查 CORS 配置

### 问题：SSE 连接立即断开

**可能原因**：
1. 未携带认证 Cookie
2. 任务 ID 不存在
3. 数据库查询失败

**解决方法**：
- 使用 `curl -N -b "auth-session=..." URL` 测试
- 检查服务器日志中的错误信息
- 验证任务 ID 是否存在于数据库中

## 未来改进

1. **Session 管理**：实现基于 Redis 的 Session 存储
2. **JWT 支持**：提供 JWT Token 作为备选认证方式
3. **刷新令牌**：实现 Token 自动刷新机制
4. **多因素认证**：支持 2FA/OTP
5. **权限系统**：实现基于角色的访问控制 (RBAC)

## 参考资料

- [Fastify Authentication](https://fastify.dev/docs/latest/Reference/Hooks/#onrequest)
- [JSend 规范](https://github.com/omniti-labs/jsend)
- [HTTP Cookie 安全最佳实践](https://owasp.org/www-community/controls/SecureCookieAttribute)
