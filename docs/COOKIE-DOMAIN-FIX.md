# Cookie Domain 配置修复 - 解决跨端口认证问题

## 问题描述

用户登录成功后,访问 `/api/auth/me` 返回 `unauthenticated` 状态,但日志显示登录成功。

### 症状

```json
// 响应内容
{
  "status": "success",
  "data": {
    "status": "unauthenticated",
    "user": null
  }
}

// 但日志显示
[11:10:55 UTC] INFO: ✅ 用户登录成功
    userId: "wuceavxu85algmym091ea2lr"
    email: "demo@demo.com"
```

## 根本原因分析

### 架构背景
- **前端**: 运行在 `http://192.168.88.100:4100`
- **后端**: 运行在 `http://192.168.88.100:3000`
- **问题**: 不同端口导致 Cookie 无法跨端口共享

### Cookie Domain 的浏览器行为

当设置 Cookie 时:

1. **未指定 domain** (我们的问题):
   ```typescript
   reply.setCookie('auth-session', sessionData, {
     httpOnly: true,
     sameSite: 'lax',
     path: '/',
     // ❌ 没有 domain
   });
   ```
   - 浏览器会将 Cookie 的 domain 设置为 `192.168.88.100:3000` (包含端口)
   - Cookie 只在 `http://192.168.88.100:3000` 域名下发送
   - 前端访问 `/api/auth/me` 时,请求来自 `http://192.168.88.100:4100`
   - **结果**: 浏览器不发送 Cookie (domain 不匹配)

2. **指定 domain** (Next.js 的正确做法):
   ```typescript
   cookieStore.set('auth-session', userData, {
     httpOnly: true,
     sameSite: "lax",
     path: "/",
     domain: "192.168.88.100", // ✅ 不包含端口
   });
   ```
   - Cookie 的 domain 为 `192.168.88.100`
   - Cookie 在所有 `http://192.168.88.100:*` 域名下发送
   - **结果**: Cookie 可以跨端口共享

## 对比 Next.js 实现

### Next.js 的 Cookie 配置 (`lib/utils/auth.ts`)
```typescript
export async function setUserCookie(user: UserSession): Promise<void> {
  const cookieStore = await cookies();
  const userData = JSON.stringify(user);

  cookieStore.set(AUTH_COOKIE_NAME, userData, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
    domain: "192.168.88.100", // ✅ 关键：跨端口共享 Cookie
  });
}
```

### 我们原来的 Fastify 配置
```typescript
reply.setCookie(COOKIE_NAME, sessionData, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: COOKIE_MAX_AGE,
  path: '/',
  // ❌ 缺少 domain 配置!
});
```

## 解决方案

### 1. 添加环境变量配置 (`src/config/index.ts`)

```typescript
// Cookie domain 配置（跨端口共享 Cookie）
COOKIE_DOMAIN: z.string().default('192.168.88.100'),
```

导出配置:
```typescript
// Cookie 配置
cookie: {
  domain: env.COOKIE_DOMAIN,
},
```

### 2. 修改 Cookie 设置 (`src/routes/auth.route.ts`)

**登录时设置 Cookie**:
```typescript
reply.setCookie(COOKIE_NAME, sessionData, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: COOKIE_MAX_AGE,
  path: '/',
  domain: config.cookie.domain, // ✅ 跨端口共享 Cookie
});
```

**清除 Cookie 时也要指定 domain**:
```typescript
reply.clearCookie(COOKIE_NAME, {
  path: '/',
  domain: config.cookie.domain, // ✅ 必须与设置时一致
});
```

## 修改的文件

1. **`src/config/index.ts`**
   - 添加 `COOKIE_DOMAIN` 环境变量
   - 导出 `config.cookie.domain`

2. **`src/routes/auth.route.ts`**
   - 导入 `config`
   - 所有 `setCookie` 调用添加 `domain: config.cookie.domain`
   - 所有 `clearCookie` 调用添加 `domain: config.cookie.domain`

## 启动服务器

```bash
# 设置 Cookie domain
COOKIE_DOMAIN='192.168.88.100' PORT=3000 npx tsx src/server.ts
```

或者在 `.env` 文件中添加:
```env
COOKIE_DOMAIN=192.168.88.100
```

## 验证修复

1. 启动后端服务器 (端口 3000)
2. 启动前端应用 (端口 4100)
3. 访问 `http://192.168.88.100:4100`
4. 登录并查看 Cookie

**预期结果**:
- Cookie `auth-session` 的 domain 为 `192.168.88.100` (不包含端口)
- `/api/auth/me` 返回 `authenticated` 状态
- Cookie 在所有 API 请求中正确发送

## 技术要点

### Cookie Domain 属性规则

1. **不指定 domain**: Cookie 仅在设置它的确切主机名(包括端口)下发送
2. **指定 domain**:
   - Cookie 在该 domain 及其所有子域名下发送
   - **不包含端口号**: 这样才能跨端口共享
   - 前导点 (`.example.com`) 在现代浏览器中已弃用

### 为什么 Next.js 没有这个问题?

Next.js 前后端在同一个服务器上:
- 开发环境: 前端和 API 都在 `http://192.168.88.100:4100`
- Cookie 设置在 `http://192.168.88.100:4100/api/auth/verify-code`
- Cookie 读取在 `http://192.168.88.100:4100/api/auth/me`
- **同一个域名和端口**: 即使不设置 domain 也能工作

但 Next.js 仍然设置了 `domain: "192.168.88.100"` 是为了:
- 支持未来可能的微服务架构
- 确保不同端口的服务可以共享认证状态

### Fastify vs Next.js Cookie API

**Fastify** (`@fastify/cookie`):
```typescript
reply.setCookie(name, value, {
  domain: '192.168.88.100',
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
});
```

**Next.js** (`next/headers`):
```typescript
const cookieStore = await cookies();
cookieStore.set(name, value, {
  domain: '192.168.88.100',
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
});
```

两者的 Cookie 选项基本一致,只是 API 调用方式不同。

## 相关资源

- [MDN: Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
- [RFC 6265: HTTP State Management Mechanism](https://datatracker.ietf.org/doc/html/rfc6265)
- [Fastify Cookie Plugin](https://github.com/fastify/fastify-cookie)

## 经验教训

1. **一比一还原 Next.js 实现**: 用户说的对,必须完全参考 Next.js 的实现细节
2. **Cookie domain 不是可选的**: 在跨端口架构中,`domain` 属性是必须的
3. **设置和清除必须一致**: `clearCookie` 的选项必须与 `setCookie` 完全匹配
4. **环境变量管理**: 使用配置文件统一管理,避免硬编码
