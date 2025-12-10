# Lumi Server API 兼容性报告

**生成时间**: 2025-12-10
**对比项目**:
- **源项目**: lumi-web-next (Next.js)
- **目标项目**: lumi-server (Fastify)

---

## 🎯 兼容性总结

**整体兼容度**: ⚠️ **35%** (仅核心数据流程部分兼容)

**结论**: ❌ **当前无法无缝对接** - 需要大量修改

---

## 📊 API 端点完整对比

### ✅ 已实现且兼容 (6个端点)

| 功能 | Next.js | lumi-server | 兼容性 |
|------|---------|-------------|--------|
| 获取请求列表 | GET `/api/tasks` | GET `/api/requests` | ⚠️ 路径不同 |
| 创建生成请求 | POST `/api/tasks` | POST `/api/requests` | ⚠️ 路径不同 |
| 获取请求详情 | GET `/api/tasks/:id` | GET `/api/requests/:id` | ⚠️ 路径不同 |
| 获取公开模型 | GET `/api/gallery/models` | GET `/api/models/public` | ⚠️ 路径不同 |
| 获取模型详情 | GET `/api/gallery/models/:id` | GET `/api/models/:id` | ⚠️ 路径不同 |
| 下载计数 | POST `/api/gallery/models/:id/download` | POST `/api/models/:id/download` | ⚠️ 路径不同 |

### ❌ 缺失的关键端点 (18个)

#### 1. 认证系统 (4个端点) - **P0 优先级**

| 端点 | 方法 | 功能 | 影响 |
|------|------|------|------|
| `/api/auth/send-code` | POST | 发送邮箱验证码 | **致命** |
| `/api/auth/verify-code` | POST | 验证码登录 | **致命** |
| `/api/auth/logout` | POST | 退出登录 | **致命** |
| `/api/auth/me` | GET | 获取当前用户 | **致命** |

**业务逻辑**:
```typescript
// 1. 发送验证码
POST /api/auth/send-code
Body: { email: string }
→ 生成4位验证码 → 保存到 EmailVerificationCode → 发送邮件

// 2. 验证登录
POST /api/auth/verify-code
Body: { email: string, code: string }
→ 验证验证码 → 创建/查询 User → 设置 HTTP-only Cookie

// 3. 获取当前用户
GET /api/auth/me
Headers: Cookie
→ 验证 Cookie → 返回用户信息
```

#### 2. 任务更新 (1个端点) - **P0 优先级**

| 端点 | 方法 | 功能 | 影响 |
|------|------|------|------|
| `/api/tasks/:id` | PATCH | 选择图片触发3D生成 | **致命** |

**业务逻辑**:
```typescript
PATCH /api/tasks/:id
Body: { selectedImageIndex: number }
→ 更新 GenerationRequest.selectedImageIndex
→ 更新 GenerationRequest.phase = "MODEL_GENERATION"
→ 创建 Model + ModelGenerationJob
→ 加入 model-generation 队列
→ 返回 { model, selectedImageIndex }
```

**当前 lumi-server 的实现**:
```typescript
// ❌ 需要分两步调用,不符合 Next.js 逻辑
POST /api/models
Body: { requestId, imageIndex }
```

#### 3. SSE 实时推送 (1个端点) - **P0 优先级**

| 端点 | 方法 | 功能 | 影响 |
|------|------|------|------|
| `/api/tasks/:id/events` | GET | Server-Sent Events 实时状态 | **严重** |

**业务逻辑**:
```typescript
GET /api/tasks/:id/events
Headers: Accept: text/event-stream
→ 建立 SSE 连接
→ 发送初始状态
→ 每30秒心跳
→ Worker 更新时推送事件
```

**事件格式**:
```
event: status
data: {"phase":"IMAGE_GENERATION","status":"IMAGE_GENERATING"}

event: heartbeat
data: {"timestamp":"2025-12-10T..."}
```

#### 4. 打印功能 (2个端点) - **P1 优先级**

| 端点 | 方法 | 功能 | 影响 |
|------|------|------|------|
| `/api/tasks/:id/print` | POST | 提交打印任务 | **重要** |
| `/api/tasks/:id/print-status` | GET | 查询打印状态 | **重要** |

**业务逻辑**:
```typescript
// 1. 提交打印
POST /api/tasks/:id/print
→ 检查 Model 完成状态
→ 调用外部打印服务 API
→ 保存 sliceTaskId 到 Model
→ 返回 { sliceTaskId, printResult }

// 2. 查询打印状态
GET /api/tasks/:id/print-status
→ 查询 Model.sliceTaskId
→ 调用打印服务查询接口
→ 返回 { printStatus }
```

#### 5. 批量交互查询 (1个端点) - **P1 优先级**

| 端点 | 方法 | 功能 | 影响 |
|------|------|------|------|
| `/api/gallery/models/batch-interactions` | POST | 批量查询点赞收藏状态 | **重要** |

**业务逻辑**:
```typescript
POST /api/gallery/models/batch-interactions
Body: { modelIds: string[] }
→ 批量查询 ModelInteraction
→ 返回 { interactions: { modelId: { isLiked, isFavorited } } }
```

#### 6. 管理后台 (4个端点) - **P2 优先级**

| 端点 | 方法 | 功能 | 影响 |
|------|------|------|------|
| `/api/admin/queues/:name` | GET | 获取队列配置 | 一般 |
| `/api/admin/queues/:name` | PATCH | 更新队列配置 | 一般 |
| `/api/admin/queues/:name/pause` | POST | 暂停队列 | 一般 |
| `/api/admin/queues/:name/pause` | DELETE | 恢复队列 | 一般 |

#### 7. 其他功能 (5个端点) - **P2 优先级**

| 端点 | 方法 | 功能 | 影响 |
|------|------|------|------|
| `/api/workers/status` | GET | Worker 运行状态 | 一般 |
| `/api/openapi` | GET | OpenAPI 规范 | 一般 |
| `/api/proxy/image` | GET | 图片 CORS 代理 | 一般 |
| `/api/proxy/model` | GET | 模型 CORS 代理 | 一般 |

---

## ⚠️ 路径映射表 (前端需要修改)

如果不修改 lumi-server,前端需要做以下路径映射:

```typescript
// 前端适配代码示例
const API_PATH_MAP = {
  // 任务管理
  'GET /api/tasks': 'GET /api/requests',
  'POST /api/tasks': 'POST /api/requests',
  'GET /api/tasks/:id': 'GET /api/requests/:id',

  // 模型画廊
  'GET /api/gallery/models': 'GET /api/models/public',
  'GET /api/gallery/models/:id': 'GET /api/models/:id',
  'POST /api/gallery/models/:id/download': 'POST /api/models/:id/download',

  // 交互功能 (需要拆分)
  'POST /api/gallery/models/:id/interactions': {
    'LIKE': 'POST /api/models/:id/like',
    'FAVORITE': 'POST /api/models/:id/favorite'
  },
  'GET /api/gallery/models/:id/interactions': 'GET /api/models/:id/interaction-status',
}
```

---

## 🔧 数据库 Schema 对比

### ✅ 已存在的表

| Next.js (Prisma) | lumi-server (Drizzle) | 兼容性 |
|------------------|----------------------|--------|
| User | users | ✅ |
| EmailVerificationCode | email_verification_codes | ✅ |
| GenerationRequest | generation_requests | ✅ |
| GeneratedImage | generated_images | ✅ |
| Model | models | ✅ |
| ImageGenerationJob | image_generation_jobs | ✅ |
| ModelGenerationJob | model_generation_jobs | ✅ |
| ModelInteraction | model_interactions | ✅ |

### ❌ 缺失的表

| Next.js 表名 | 用途 | 优先级 |
|-------------|------|--------|
| QueueConfig | 队列配置管理 | P2 |

### ⚠️ 字段差异

#### Model 表

| 字段 | Next.js | lumi-server | 说明 |
|------|---------|-------------|------|
| sliceTaskId | ✅ 有 | ❌ **缺失** | 打印切片任务ID |
| printStatus | ✅ 有 | ❌ **缺失** | 打印状态 |

**建议**: 添加这两个字段到 `models` 表

```typescript
// src/db/schema/models.ts
export const models = mysqlTable('models', {
  // ... 现有字段
  sliceTaskId: varchar('slice_task_id', { length: 255 }),
  printStatus: mysqlEnum('print_status', [
    'NOT_STARTED',
    'SLICING',
    'SLICE_COMPLETE',
    'PRINTING',
    'PRINT_COMPLETE',
    'FAILED'
  ]),
});
```

---

## 📝 响应格式对比

### ✅ 一致的部分

两个项目都使用 **JSend 规范**,格式完全一致:

```json
{
  "status": "success",
  "data": { ... }
}
```

### ⚠️ 不一致的部分

#### 1. 分页格式

**Next.js**:
```json
{
  "status": "success",
  "data": {
    "items": [...],
    "total": 100,
    "hasMore": true
  }
}
```

**lumi-server**:
```json
{
  "status": "success",
  "data": [...]
}
```

**建议**: lumi-server 需要修改为包含分页信息的格式

#### 2. PATCH /api/tasks/:id 响应

**Next.js**:
```json
{
  "status": "success",
  "data": {
    "model": { ... },
    "selectedImageIndex": 0
  }
}
```

**lumi-server**: ❌ 端点不存在

---

## 🎯 实现优先级建议

### P0 - 必须实现 (否则无法使用)

1. **认证系统** (估时: 4小时)
   - POST `/api/auth/send-code`
   - POST `/api/auth/verify-code`
   - POST `/api/auth/logout`
   - GET `/api/auth/me`
   - Cookie-based Session 管理

2. **任务更新 API** (估时: 2小时)
   - PATCH `/api/tasks/:id` (选择图片触发3D)
   - 修改现有的 POST `/api/models` 逻辑

3. **SSE 实时推送** (估时: 6小时)
   - GET `/api/tasks/:id/events`
   - Worker 事件推送机制
   - 心跳保持

**P0 总计**: 约 12 小时

### P1 - 重要功能 (影响核心体验)

4. **打印功能** (估时: 4小时)
   - POST `/api/tasks/:id/print`
   - GET `/api/tasks/:id/print-status`
   - 添加 `sliceTaskId` 和 `printStatus` 字段

5. **批量交互查询** (估时: 1小时)
   - POST `/api/gallery/models/batch-interactions`

6. **Worker 状态** (估时: 1小时)
   - GET `/api/workers/status`

**P1 总计**: 约 6 小时

### P2 - 辅助功能 (可延后)

7. **管理后台** (估时: 6小时)
   - 队列配置 CRUD
   - 添加 `queue_config` 表

8. **文件代理** (估时: 2小时)
   - 图片/模型 CORS 代理

9. **API 文档** (估时: 2小时)
   - OpenAPI 生成

**P2 总计**: 约 10 小时

---

## 🔄 前端对接方案对比

### 方案 1: 修改 lumi-server (推荐)

**优点**:
- 前端无需修改,完全兼容
- 符合原始设计
- 长期维护成本低

**缺点**:
- 需要实现所有缺失端点 (~28小时工作量)

**步骤**:
1. 实现 P0 功能 (12h)
2. 修改 API 路径匹配 Next.js
3. 测试所有端点
4. 前端直接切换 baseURL

### 方案 2: 修改前端 API 调用

**优点**:
- 快速上线
- lumi-server 改动小

**缺点**:
- 前端需要大量修改
- 缺失功能仍需实现
- 维护两套 API 文档

**步骤**:
1. 前端创建 API 适配层
2. 实现路径映射
3. 处理响应格式差异
4. 缺失功能降级处理

### 方案 3: 混合模式 (过渡方案)

**优点**:
- 渐进式迁移
- 风险可控

**缺点**:
- 同时维护两套后端
- 复杂度高

**步骤**:
1. lumi-server 实现核心功能 (P0)
2. 前端通过代理部分路由到 Next.js
3. 逐步切换到 lumi-server
4. 最终下线 Next.js

---

## ✅ 快速兼容清单

如果只想**最小改动实现基本可用**,需要:

### lumi-server 必须修改:

1. **修改路径** (1小时)
   ```typescript
   // src/routes/index.ts
   // 将所有 /api/requests 改为 /api/tasks
   // 将所有 /api/models 改为 /api/gallery/models
   ```

2. **实现认证** (4小时)
   - 认证中间件
   - 4个认证端点

3. **实现 PATCH /api/tasks/:id** (2小时)
   - 选择图片触发3D生成

4. **修改响应格式** (1小时)
   - 添加分页信息

**最小改动总计**: 8小时

### 前端必须修改:

如果 lumi-server 不改:
- 修改所有 API 调用路径 (2小时)
- 处理缺失功能降级 (2小时)

**前端改动总计**: 4小时

---

## 📊 兼容性评分

| 维度 | 得分 | 说明 |
|------|------|------|
| API 路径 | 0/100 | 完全不匹配 |
| 响应格式 | 90/100 | 基本一致,分页格式有差异 |
| 数据模型 | 95/100 | Schema 基本一致,缺少2个字段 |
| 核心功能 | 40/100 | 6/24 端点可用 |
| 认证系统 | 0/100 | 完全缺失 |

**综合评分**: 35/100

---

## 🎯 最终建议

### 推荐方案: **修改 lumi-server 路径 + 实现 P0 功能**

**理由**:
1. 投入 12 小时可实现核心功能
2. 前端完全无需改动
3. 架构更清晰,长期维护成本低

**实施计划**:

**第一阶段** (12小时 - P0):
1. Day 1 (4h): 认证系统
2. Day 2 (2h): PATCH /api/tasks/:id
3. Day 3 (6h): SSE 实时推送
4. 测试 & 修复

**第二阶段** (6小时 - P1):
5. Day 4 (4h): 打印功能
6. Day 5 (2h): 批量查询 + Worker 状态

**第三阶段** (10小时 - P2):
7. 管理后台
8. 文件代理
9. API 文档

---

**结论**: ❌ **当前 lumi-server 无法直接对接 Next.js 前端**

需要完成 **P0 优先级功能** 后才能实现无缝切换。

---

*报告生成时间: 2025-12-10*
*版本: v1.0*
