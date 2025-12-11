# CORS 配置修复 - 解决 SSE 认证问题

## 问题描述

EventSource (SSE) 连接到 `/api/tasks/:id/events` 时返回 401 Unauthorized，但其他 API 请求认证正常。

### 症状

- ✅ 用户已成功登录
- ✅ 普通 GET/POST 请求携带 cookies 正常 (200 OK)
- ❌ SSE 请求**不携带 cookies** (401 Unauthorized)

### 日志对比

```
# 普通请求
cookies: {"auth-session": "{\"userId\":\"...\",\"email\":\"...\"}"}

# SSE 请求
cookies: {}
```

## 根本原因

### 架构背景
- 前端运行在: `http://192.168.88.100:4100`
- 后端运行在: `http://192.168.88.100:3000`
- 这是**跨域场景**(不同端口)

### CORS 配置错误

**错误的配置** (`src/app.ts`):
```typescript
await app.register(cors, {
  origin: config.isDevelopment, // ❌ 等于 true，返回 Access-Control-Allow-Origin: *
  credentials: true,
});
```

**问题分析**:
1. `origin: true` 导致 Fastify 返回 `Access-Control-Allow-Origin: *`
2. 浏览器安全策略: `Access-Control-Allow-Origin: *` 不能与 `Access-Control-Allow-Credentials: true` 同时使用
3. 结果: 浏览器**阻止** EventSource 发送 cookies

## 解决方案

### 1. 修改配置文件 (`src/config/index.ts`)

添加前端域名白名单:

```typescript
// 前端域名配置(CORS)
FRONTEND_URLS: z
  .string()
  .default('http://localhost:4100,http://192.168.88.100:4100')
  .transform((val) => val.split(',').map(url => url.trim())),
```

导出 CORS 配置:

```typescript
// CORS 配置
cors: {
  origins: env.FRONTEND_URLS,
},
```

### 2. 修改 CORS 注册 (`src/app.ts`)

```typescript
// CORS 配置
await app.register(cors, {
  origin: config.cors.origins, // ✅ 使用具体的前端域名列表
  credentials: true,
});
```

### 3. Cookie 配置保持不变 (`src/routes/auth.route.ts`)

```typescript
reply.setCookie(COOKIE_NAME, sessionData, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', // ✅ lax 模式配合正确的 CORS 即可
  maxAge: COOKIE_MAX_AGE,
  path: '/',
});
```

## 验证结果

### CORS 响应头 (修复后)

```http
access-control-allow-origin: http://192.168.88.100:4100
access-control-allow-credentials: true
vary: Origin
```

✅ 不再是 `Access-Control-Allow-Origin: *`
✅ 浏览器现在可以在跨域请求中携带 cookies

## 启动服务器

```bash
# 设置前端域名白名单
FRONTEND_URLS='http://localhost:4100,http://192.168.88.100:4100' PORT=3000 npx tsx src/server.ts
```

或者在 `.env` 文件中添加:

```env
FRONTEND_URLS=http://localhost:4100,http://192.168.88.100:4100
```

## 测试步骤

1. 启动后端服务器 (端口 3000)
2. 启动前端应用 (端口 4100)
3. 访问 `http://192.168.88.100:4100`
4. 登录并创建任务
5. 观察 SSE 连接 (`/api/tasks/:id/events`) 不再返回 401

## 技术要点

### EventSource 与 CORS

EventSource API 遵循浏览器 CORS 策略:
- 跨域请求需要正确的 `Access-Control-Allow-Origin` 头
- 携带 credentials 时不能使用通配符 `*`
- 必须明确指定允许的源域名

### CORS Credentials 要求

当 `credentials: true` 时:
1. `Access-Control-Allow-Origin` 必须是**具体域名**,不能是 `*`
2. `Access-Control-Allow-Credentials` 必须是 `true`
3. Cookie 的 `sameSite` 设置要兼容跨站请求

### Fastify CORS 插件行为

- `origin: true` → 返回请求的 `Origin` 头作为允许源 (如果未设置则返回 `*`)
- `origin: ['http://...']` → 仅允许列表中的源
- `credentials: true` → 自动设置 `Access-Control-Allow-Credentials: true`

## 相关文件

- `src/config/index.ts` - 配置定义
- `src/app.ts` - CORS 注册
- `src/routes/auth.route.ts` - Cookie 设置
- `src/middleware/auth.middleware.ts` - 认证中间件
- `src/routes/tasks.route.ts` - SSE 端点

## 参考

- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [MDN: EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [Fastify CORS Plugin](https://github.com/fastify/fastify-cors)
