# MTL URL 前端显示问题调试文档

## 问题描述

用户报告:访问 `http://192.168.88.100:3000/api/tasks/tugjvdgy4ea812x7vszq9kdk` API 时,返回的模型数据中没有 `mtlUrl` 和 `textureUrl` 字段。

## 后端验证结果

### 1. 数据库验证 ✅

运行 `npx tsx scripts/check-task.ts` 查询该任务的数据库记录:

```
✅ 任务信息:
ID: tugjvdgy4ea812x7vszq9kdk
阶段: MODEL_GENERATION
状态: MODEL_PENDING

📦 模型信息:
ID: dmq5jxnwmldwl7k6hdbh6dg7
格式: OBJ
创建时间: 2025-12-12T10:19:05.000Z
完成时间: 2025-12-12T10:20:42.000Z

🔗 URL 数据:
modelUrl:   https://ai3d-1375240212.cos.ap-guangzhou.myqcloud.com/models/dmq5jxnwmldwl7k6hdbh6dg7/model.obj
mtlUrl:     https://ai3d-1375240212.cos.ap-guangzhou.myqcloud.com/models/dmq5jxnwmldwl7k6hdbh6dg7/material.mtl  ✅
textureUrl: https://ai3d-1375240212.cos.ap-guangzhou.myqcloud.com/models/dmq5jxnwmldwl7k6hdbh6dg7/material.png  ✅
```

**结论**: 数据库中包含完整的 URL 数据。

### 2. Repository 层验证 ✅

检查 `src/repositories/generation-request.repository.ts`:

**`findById` 方法**(用于 `GET /api/tasks/:id`):
```typescript
// 第 85-86 行: SELECT 语句包含 mtlUrl 和 textureUrl
mtlUrl: models.mtlUrl,
textureUrl: models.textureUrl,

// 第 125-126 行: 转换为代理 URL
mtlUrl: transformToProxyUrl(modelRow.mtlUrl, 'model'),
textureUrl: transformToProxyUrl(modelRow.textureUrl, 'model'),
```

**结论**: Repository 正确选择和转换了这些字段。

### 3. Service 层验证 ✅

检查 `src/services/generation-request.service.ts`:

```typescript
// 第 43-50 行: getRequestById 直接返回 repository 结果
export async function getRequestById(requestId: string) {
  const request = await generationRequestRepository.findById(requestId);
  if (!request) {
    throw new NotFoundError(`生成请求不存在: ${requestId}`);
  }
  return request; // ✅ 直接返回,包含所有字段
}
```

**结论**: Service 层未过滤字段,直接返回完整数据。

### 4. API 路由层验证 ✅

检查 `src/routes/tasks.route.ts`:

```typescript
// 第 71-91 行: GET /api/tasks/:id 路由
fastify.get('/api/tasks/:id', async (request, reply) => {
  const { id } = request.params;
  const generationRequest = await GenerationRequestService.getRequestById(id);
  return reply.send(success(generationRequest)); // ✅ 直接返回
});
```

**结论**: API 路由未过滤字段,直接返回服务层结果。

### 5. Task Adapter 验证 ✅

检查 `src/utils/task-adapter.ts`(用于 SSE 推送):

```typescript
// 第 59-63 行: 适配模型数据时使用展开运算符
const adaptedModel = {
  ...model, // ✅ 保留所有原始字段,包括 mtlUrl 和 textureUrl
  generationStatus,
  progress,
};
```

**结论**: Task adapter 保留了所有字段。

### 6. SSE 推送验证 ✅

检查 `src/workers/model.worker.ts`:

```typescript
// 第 187-195 行: model:completed 事件推送
await sseConnectionManager.broadcast(requestId, 'model:completed', {
  modelId,
  modelUrl: transformToProxyUrl(objUrl, 'model'),
  mtlUrl: transformToProxyUrl(mtlUrl, 'model'), // ✅ 包含 MTL URL
  textureUrl: transformToProxyUrl(textureUrl, 'model'), // ✅ 包含纹理 URL
  previewImageUrl: transformToProxyUrl(previewImageStorageUrl, 'image'),
  format: modelFile.type || 'OBJ',
  completedAt,
});
```

**结论**: SSE 事件包含完整的字段。

## 可能的原因

### 1. 前端缓存问题 ⚠️

**症状**: 用户在看旧的页面数据或状态缓存。

**解决方案**:
- 刷新浏览器页面(硬刷新: Ctrl+Shift+R 或 Cmd+Shift+R)
- 清除浏览器缓存
- 打开浏览器开发者工具 → Network 标签 → 勾选 "Disable cache"

### 2. SSE 连接问题 ⚠️

**症状**: 该任务的 SSE 连接在 `model:completed` 事件推送之前就断开了,前端只收到了初始状态。

**解决方案**:
- 重新连接 SSE(刷新页面或重新导航到该任务详情页)
- 检查浏览器开发者工具 → Network → EventStream 连接状态

### 3. 前端代码问题 ⚠️

**症状**: 前端在处理 API 响应或 SSE 事件时过滤掉了这些字段。

**需要检查的前端代码**:
- SSE 事件处理器(`model:completed` 事件的 handler)
- API 响应处理逻辑
- 状态管理(Redux/Zustand)中的数据转换
- TypeScript 类型定义是否包含这些字段

**检查位置**:
```bash
# 在前端项目中搜索这些关键代码
cd /Users/yaotutu/Desktop/code/lumi-web-next

# 搜索 model:completed 事件处理
grep -r "model:completed" .

# 搜索任务详情页组件
find . -name "*task*detail*" -o -name "*workspace*"

# 搜索 API 调用
grep -r "/api/tasks/" .
```

### 4. 时间窗口问题 ⚠️

**症状**: 该模型生成于代码修复之前,当时 Worker 还未保存 MTL URL。

**验证**:
- 模型完成时间: `2025-12-12T10:20:42.000Z`(UTC)
- 代码修复时间: `2025-12-12T17:50:00+08:00`(本地时间)
- 转换为 UTC: `2025-12-12T09:50:00Z`

**如果模型完成时间 > 代码修复时间**:说明是在修复后生成的,数据应该是正确的。

**如果模型完成时间 < 代码修复时间**:说明是旧数据,需要生成新任务测试。

## 推荐的调试步骤

### 步骤 1: 使用浏览器开发者工具检查实际 API 响应

1. 打开浏览器开发者工具(F12)
2. 切换到 **Network** 标签
3. 勾选 **Preserve log**
4. 访问或刷新任务详情页面
5. 找到 `/api/tasks/tugjvdgy4ea812x7vszq9kdk` 请求
6. 点击查看 **Response** 标签
7. 搜索 `mtlUrl` 字段

**如果响应中包含 mtlUrl**:
- 问题在前端代码,前端过滤或忽略了这个字段
- 需要检查前端的数据处理逻辑

**如果响应中不包含 mtlUrl**:
- 需要进一步调试后端
- 可能是认证或权限问题导致返回了不同的数据

### 步骤 2: 检查 SSE 事件流

1. 打开浏览器开发者工具 → **Network** 标签
2. 刷新页面
3. 找到类型为 **EventStream** 的连接(`/api/tasks/xxx/events`)
4. 点击查看 **EventStream** 标签
5. 查找 `model:completed` 事件
6. 检查事件数据是否包含 `mtlUrl`

### 步骤 3: 生成新任务测试

为了排除时间窗口问题,建议:

1. 创建一个**全新的**生成任务
2. 选择图片并触发 3D 模型生成
3. 等待模型生成完成
4. 检查返回的数据是否包含 `mtlUrl` 和 `textureUrl`

## 后端调试工具

项目中提供了以下脚本用于调试:

```bash
# 检查所有 OBJ 模型的 URL 数据
npx tsx scripts/check-model-urls.ts

# 检查特定任务的数据
npx tsx scripts/check-task.ts

# 检查特定模型的数据
npx tsx scripts/check-specific-model.ts
```

## 预期的正确响应格式

### GET /api/tasks/:id 响应

```json
{
  "status": "success",
  "data": {
    "id": "tugjvdgy4ea812x7vszq9kdk",
    "userId": "wuceavxu85algmym091ea2lr",
    "prompt": "兵马俑雕塑...",
    "phase": "MODEL_GENERATION",
    "status": "MODEL_PENDING",
    "selectedImageIndex": 1,
    "images": [...],
    "model": {
      "id": "dmq5jxnwmldwl7k6hdbh6dg7",
      "format": "OBJ",
      "modelUrl": "http://192.168.88.100:3000/api/proxy/model?url=...",
      "mtlUrl": "http://192.168.88.100:3000/api/proxy/model?url=...",
      "textureUrl": "http://192.168.88.100:3000/api/proxy/model?url=...",
      "previewImageUrl": "http://192.168.88.100:3000/api/proxy/image?url=...",
      "completedAt": "2025-12-12T10:20:42.000Z",
      "generationStatus": "COMPLETED",
      "progress": 100
    }
  }
}
```

### SSE model:completed 事件

```
event: model:completed
data: {
  "modelId": "dmq5jxnwmldwl7k6hdbh6dg7",
  "modelUrl": "http://192.168.88.100:3000/api/proxy/model?url=...",
  "mtlUrl": "http://192.168.88.100:3000/api/proxy/model?url=...",
  "textureUrl": "http://192.168.88.100:3000/api/proxy/model?url=...",
  "previewImageUrl": "http://192.168.88.100:3000/api/proxy/image?url=...",
  "format": "OBJ",
  "completedAt": "2025-12-12T10:20:42.000Z"
}
```

## 总结

**后端实现已验证正确**:所有层级(Worker → Database → Repository → Service → API Route → SSE)都正确处理并传递了 `mtlUrl` 和 `textureUrl` 字段。

**问题很可能在前端**:需要检查前端的缓存、SSE 事件处理、API 响应处理或状态管理逻辑。

**建议**:
1. 首先使用浏览器开发者工具检查实际的网络响应
2. 生成新任务进行测试
3. 如果问题仍然存在,需要检查前端代码

---

**文档创建时间**: 2025-12-12
**问题状态**: 后端已修复 ✅,前端待验证 ⚠️
