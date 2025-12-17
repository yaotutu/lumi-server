# 认证系统实现文档

## 概述

Lumi Server 使用 Bearer Token 认证方式，通过 Fastify 中间件统一拦截需要认证的 API 请求。登录系统由外部用户服务维护，本服务仅负责验证 Token 和管理用户授权。

## 架构设计

### 核心原则

1. **外部登录系统**：用户登录由外部用户服务（USER_SERVICE_URL）管理
2. **Bearer Token 认证**：所有请求通过 `Authorization: Bearer {token}` 请求头传递认证信息
3. **统一认证拦截**：所有认证逻辑集中在 `authMiddleware` 中，避免在每个路由处理器中重复验证
4. **请求头传递用户信息**：认证成功后通过 `x-user-id` 和 `x-user-email` 请求头传递用户信息
5. **路由级别的访问控制**：基于路径和 HTTP 方法的细粒度权限控制
6. **JSend 响应格式**：401 错误统一使用 JSend 格式返回

### 认证流程

```
客户端请求（携带 Authorization Header）
    ↓
[authMiddleware]
    ↓
检查路径是否需要认证？
    ├─ 否 → 直接放行
    └─ 是 → 验证 Bearer Token
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

#### Token 验证方式
```typescript
// 从 Authorization Header 获取 Bearer Token
const authHeader = request.headers.authorization;

if (!authHeader || !authHeader.startsWith('Bearer ')) {
  // 返回 401 未授权
}

// 调用外部用户服务验证 Token
const externalUser = await externalUserService.verifyTokenAndGetUser(authHeader);
```

#### 中间件逻辑

1. **路径过滤**：只拦截 `/api/*` 路径
2. **路由检查**：使用 `isProtectedRoute()` 判断是否需要认证
3. **Token 验证**：调用外部用户服务验证 Bearer Token
4. **请求头设置**：认证成功后设置 `x-user-id` 和 `x-user-email`
5. **错误响应**：认证失败返回 401 + JSend 格式

### 3. 外部用户服务集成 (`src/services/external-user.service.ts`)

#### 配置
```typescript
// 环境变量配置
USER_SERVICE_URL=http://user.ai3d.top
```

#### 功能
- **Token 验证**：向外部服务发送 Token 验证请求
- **用户信息获取**：从外部服务获取用户详情
- **Token 刷新**：支持 Token 自动刷新（如果外部服务提供）

### 4. 应用注册 (`src/app.ts`)

```typescript
// CORS 配置 - 不再需要 credentials（无 Cookie 传递）
await app.register(cors, {
  origin: config.cors.origins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
});

// 认证中间件（必须在路由之前注册）
app.addHook('onRequest', authMiddleware);
```

**注意**：认证中间件必须在路由注册之前添加，这样才能拦截所有请求。

## 使用方式

### 路由处理器中获取用户信息

所有受保护的路由处理器可以直接从请求头获取用户信息：

```typescript
import { getUserIdFromRequest, getUserEmailFromRequest } from '@/utils/request-auth';

fastify.get('/api/tasks', async (request, reply) => {
  // 从认证中间件设置的请求头获取用户信息
  const userId = getUserIdFromRequest(request);
  const email = getUserEmailFromRequest(request);

  // 注意：受保护的路由保证 userId 一定存在
  // 不需要额外验证

  const tasks = await TaskService.listTasks(userId);
  return reply.send(success(tasks));
});
```

### 前端发送认证请求

前端需要在 Authorization Header 中包含有效的 Bearer Token：

```typescript
// 1. 用户登录（由外部登录系统处理）
const loginResponse = await fetch('http://user.ai3d.top/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

const { token } = await loginResponse.json();

// 2. 存储 Token
localStorage.setItem('auth_token', token);

// 3. 发送认证请求
const response = await fetch('http://localhost:3000/api/tasks', {
  headers: {
    'Authorization': `Bearer ${token}`,  // 重要：携带 Bearer Token
  },
});
```

### curl 测试示例

#### 未认证访问受保护 API
```bash
curl http://localhost:3000/api/tasks
# 响应：401 Unauthorized
# {
#   "status": "fail",
#   "data": {
#     "message": "请先登录",
#     "code": "UNAUTHORIZED"
#   }
# }
```

#### 带认证 Token 访问
```bash
# 假设您已从外部登录系统获取了 Token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/tasks
# 响应：200 OK
# {
#   "status": "success",
#   "data": { "items": [...], "total": 10 }
# }
```

#### SSE 连接
```bash
curl -N -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/tasks/abc123/events
# 响应：SSE 流
# event: task:init
# data: {"id":"abc123",...}
```

## 安全考虑

### Token 安全

1. **HTTPS 传输**：生产环境必须使�� HTTPS 防止 Token 被截获
2. **Token 过期**：由外部用户服务管理 Token 过期时间
3. **Token 刷新**：实现自动 Token 刷新机制，避免用户频繁登录
4. **安全存储**：前端应使用 `localStorage` 或 `sessionStorage` 安全存储 Token

### CORS 配置

```typescript
await app.register(cors, {
  origin: config.cors.origins,  // 白名单域名
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
});
```

**注意**：不再需要 `credentials: true`，因为不使用 Cookie。

### 请求头验证

认证中间件会验证：
1. `Authorization` Header 是否存在
2. Token 格式是否为 `Bearer {token}`
3. Token 是否有效（调用外部服务验证）

## 环境配置

### 必需环境变量

```bash
# 外部用户服务 API 地址
USER_SERVICE_URL=http://user.ai3d.top

# CORS 白名单（前端域名）
FRONTEND_URLS=http://localhost:4100,http://192.168.88.100:4100
```

## 测试验证

### 测试场景

- ✅ 未认证访问受保护 API 返回 401
- ✅ 带有效 Token 访问受保护 API 返回 200
- ✅ 无效 Token 访问返回 401
- ✅ Token 过期访问返回 401
- ✅ 公开 API 无需认证即可访问
- ✅ SSE 端点需要认证
- ✅ 带认证的 SSE 连接正常工作
- ✅ 请求头正确设置 `x-user-id` 和 `x-user-email`

### 测试日志示例

```
[WARN] 未认证访问受保护的 API
  pathname: "/api/tasks"
  method: "GET"
  reason: "Missing Authorization header"

[INFO] incoming request
  reqId: "req-1"
  req: {"method":"GET","url":"/api/tasks","headers":{"authorization":"Bearer xxx"}}

[INFO] Token 验证成功
  userId: "user-123"
  email: "user@example.com"

[INFO] request completed
  reqId: "req-1"
  res: {"statusCode":200}
```

## 故障排查

### 问题：前端总是收到 401

**可能原因**：
1. Token 未正确设置或已过期
2. Authorization Header 格式错误（应为 `Bearer {token}`）
3. 外部用户服务不可用
4. Token 在外部服务中已失效

**解决方法**：
- 检查浏览器开发者工具的 Network 选项卡，确认 Authorization Header
- 验证 Token 格式：`Authorization: Bearer {actual_token}`
- 测试外部用户服务是否可访问
- 检查 Token 是否过期，尝试重新登录

### 问题：SSE 连接立即断开

**可能原因**：
1. 未携带认证 Token
2. Token 无效或过期
3. 任务 ID 不存在
4. 数据库查询失败

**解决方法**：
- 使用 `curl -N -H "Authorization: Bearer {token}" URL` 测试
- 检查服务器日志中的错误信息
- 验证任务 ID 是否存在于数据库中
- 确认 Token 有效性

### 问题：跨域请求失败

**可能原因**：
1. CORS 配置缺少前端域名
2. 预检请求（OPTIONS）被拦截

**解决方法**：
```bash
# 检查 CORS 配置
grep -r "FRONTEND_URLS" .env

# 确保包含前端域名
FRONTEND_URLS=http://localhost:4100,http://192.168.88.100:4100
```

## 与前端的集成

### React 示例

```typescript
// API 客户端
class ApiClient {
  private baseURL = 'http://localhost:3000';
  
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    };
  }
  
  async get(path: string) {
    const response = await fetch(`${this.baseURL}${path}`, {
      headers: this.getHeaders(),
    });
    
    if (response.status === 401) {
      // Token 失效，跳转到登录页
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    
    return response.json();
  }
  
  async post(path: string, data: unknown) {
    const response = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    
    if (response.status === 401) {
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    
    return response.json();
  }
}

export const apiClient = new ApiClient();
```

### 使用示例

```typescript
// 获取任务列表
const tasks = await apiClient.get('/api/tasks');

// 创建新任务
const newTask = await apiClient.post('/api/tasks', {
  prompt: 'Generate a 3D model',
  type: 'MODEL',
});
```

## 未来改进

1. **Token 刷新机制**：实现自动 Token 刷新，提升用户体验
2. **多因素认证**：支持 2FA/OTP 增强安全性
3. **权限系统**：实现基于角色的访问控制 (RBAC)
4. **API Key 支持**：为第三方集成提供 API Key 认证
5. **审计日志**：记录所有认证和授权操作

## 参考资料

- [Fastify Authentication](https://fastify.dev/docs/latest/Reference/Hooks/#onrequest)
- [Bearer Token 规范](https://datatracker.ietf.org/doc/html/rfc6750)
- [JSend 规范](https://github.com/omniti-labs/jsend)
- [OAuth 2.0 最佳实践](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
