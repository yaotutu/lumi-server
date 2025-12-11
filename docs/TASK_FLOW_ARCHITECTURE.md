# 任务流程架构文档

## 架构概述

本项目采用 **混合架构（方案 B）**，结合了数据库存储和 BullMQ 队列的优势：

- ✅ **数据库层**：完整的任务状态存储（Request, Image, ImageJob, Model, ModelJob）
- ✅ **队列层**：BullMQ + Redis 用于任务调度和分发
- ✅ **Worker 层**：从队列消费任务，查询数据库获取详细信息后处理

## 与 Next.js 版本的对比

| 对比项 | Next.js 版本 | Fastify 版本（当前） |
|--------|-------------|-------------------|
| **Worker 启动方式** | `instrumentation.ts` 自动启动 | `src/server.ts` 手动启动 |
| **任务调度机制** | 数据库轮询（每 2 秒） | BullMQ + Redis 队列（事件驱动） |
| **任务存储** | 仅 MySQL | MySQL + Redis 双存储 |
| **创建任务流程** | 创建数据库记录 → Worker 轮询 | 创建数据库记录 → 加入队列 → Worker 消费 |
| **SSE 推送** | ✅ 8 个事件类型 | ✅ 8 个事件类型（一致） |
| **错误重试** | 数据库记录重试次数 | BullMQ 自动重试 + 数据库记录 |

## 详细任务流程

### 阶段 1：服务器启动

```typescript
// src/server.ts
async function start() {
  // 1. 连接数据库和 Redis
  await testConnection();
  await redisClient.ping();

  // 2. 启动 Workers（关键！）
  const imageWorker = createImageWorker();
  const modelWorker = createModelWorker();

  // 3. 启动 Fastify 应用
  const app = await buildApp();
  await app.listen({ port: 3000 });
}
```

**关键点：** Workers 必须在服务器启动时初始化，否则队列中的任务无法被消费。

---

### 阶段 2：用户创建任务

```typescript
// POST /api/tasks
fastify.post('/api/tasks', async (request, reply) => {
  const { prompt, optimizePrompt = true } = request.body;

  // 步骤 1: 优化提示词（可选）
  let finalPrompt = prompt.trim();
  if (optimizePrompt) {
    finalPrompt = await PromptOptimizerService.optimizePromptFor3DPrint(prompt);
  }

  // 步骤 2: 创建数据库记录
  // ✅ 自动创建：
  //   - 1 个 GenerationRequest
  //   - 4 个 GeneratedImage (imageStatus=PENDING)
  //   - 4 个 ImageGenerationJob (status=PENDING)
  const generationRequest = await GenerationRequestService.createRequest(
    userId,
    finalPrompt
  );

  // 步骤 3: 将 4 个 ImageJob 加入 BullMQ 队列
  const imageJobs = await Promise.all(
    generationRequest.images.map(async (image) => {
      const job = image.generationJob; // ⬅️ 数据库中已创建的 Job

      return imageQueue.add(`image-${image.id}`, {
        jobId: job.id,       // ✅ 正确的 ImageJob ID
        imageId: image.id,   // ✅ 正确的 Image ID
        prompt: finalPrompt,
        requestId: generationRequest.id,
        userId,
      });
    })
  );

  return reply.status(201).send(success(generationRequest));
});
```

**数据库状态：**
```sql
-- GenerationRequest
INSERT INTO generation_requests (id, userId, prompt, status='IMAGE_PENDING', phase='IMAGE_GENERATION')

-- 4 个 GeneratedImage
INSERT INTO generated_images (id, requestId, index=0, imageStatus='PENDING')
INSERT INTO generated_images (id, requestId, index=1, imageStatus='PENDING')
INSERT INTO generated_images (id, requestId, index=2, imageStatus='PENDING')
INSERT INTO generated_images (id, requestId, index=3, imageStatus='PENDING')

-- 4 个 ImageGenerationJob
INSERT INTO image_generation_jobs (id, imageId, status='PENDING')
INSERT INTO image_generation_jobs (id, imageId, status='PENDING')
INSERT INTO image_generation_jobs (id, imageId, status='PENDING')
INSERT INTO image_generation_jobs (id, imageId, status='PENDING')
```

**Redis 队列状态：**
```
bull:image-generation:waiting: [
  { jobId: 'xxx-1', imageId: 'img-1', ... },
  { jobId: 'xxx-2', imageId: 'img-2', ... },
  { jobId: 'xxx-3', imageId: 'img-3', ... },
  { jobId: 'xxx-4', imageId: 'img-4', ... },
]
```

---

### 阶段 3：Image Worker 处理任务

```typescript
// src/workers/image.worker.ts
async function processImageJob(job: Job<ImageJobData>) {
  const { jobId, imageId, prompt, requestId, userId } = job.data;

  // ✅ 步骤 1: 从数据库查询完整信息
  const imageJobData = await imageJobRepository.findById(jobId);
  const imageData = await generatedImageRepository.findById(imageId);

  if (!imageJobData || !imageData) {
    throw new Error('任务或图片不存在');
  }

  const imageIndex = imageData.index;

  // 步骤 2: 更新数据库状态
  await imageJobRepository.updateStatus(jobId, 'RUNNING');
  await generatedImageRepository.updateStatus(imageId, 'GENERATING');

  // 更新 Request 状态（第一个任务时）
  const currentRequest = await generationRequestRepository.findById(requestId);
  if (currentRequest && currentRequest.status === 'IMAGE_PENDING') {
    await generationRequestRepository.update(requestId, {
      status: 'IMAGE_GENERATING',
    });
  }

  // 步骤 3: SSE 推送 - image:generating
  await sseConnectionManager.broadcast(requestId, 'image:generating', {
    imageId,
    index: imageIndex,
    prompt,
  });

  // 步骤 4: 调用图片生成 Provider
  const imageProvider = createImageProvider();
  const imageUrls = await imageProvider.generateImages(prompt, 1);
  const imageUrl = imageUrls[0];

  // 步骤 5: 更新完成状态
  await generatedImageRepository.update(imageId, {
    imageUrl,
    imageStatus: 'COMPLETED',
    completedAt: new Date(),
  });

  await imageJobRepository.updateStatus(jobId, 'COMPLETED');

  // 步骤 6: SSE 推送 - image:completed
  await sseConnectionManager.broadcast(requestId, 'image:completed', {
    imageId,
    index: imageIndex,
    imageUrl,
    completedAt: new Date(),
  });

  // 步骤 7: 检查是否所有图片都完成
  const allImages = await generatedImageRepository.findByRequestId(requestId);
  const allCompleted = allImages.every(img => img.imageStatus === 'COMPLETED');

  if (allCompleted) {
    await generationRequestRepository.update(requestId, {
      status: 'IMAGE_COMPLETED',
      phase: 'AWAITING_SELECTION',
    });

    // SSE 推送 - task:updated
    await sseConnectionManager.broadcast(requestId, 'task:updated', {
      requestId,
      status: 'IMAGE_COMPLETED',
      phase: 'AWAITING_SELECTION',
    });
  }
}
```

**Worker 并发处理：**
- Image Worker 并发数：5（同时处理 5 个图片生成任务）
- Model Worker 并发数：3（同时处理 3 个 3D 模型生成任务）

---

### 阶段 4：用户选择图片并生成 3D 模型

```typescript
// PATCH /api/tasks/:id
fastify.patch('/api/tasks/:id', async (request, reply) => {
  const { id } = request.params;
  const { selectedImageIndex } = request.body;

  // 调用 Service 层处理业务逻辑
  const result = await GenerationRequestService.selectImageAndGenerateModel(
    id,
    selectedImageIndex
  );

  return reply.send(success(result));
});

// Service 层
async function selectImageAndGenerateModel(requestId, selectedImageIndex) {
  // 1. 验证请求和图片状态
  const request = await getRequestById(requestId);
  const selectedImage = request.images.find(img => img.index === selectedImageIndex);

  if (selectedImage.imageStatus !== 'COMPLETED') {
    throw new ValidationError('图片尚未生成完成');
  }

  // 2. 更新 Request 状态
  await generationRequestRepository.update(requestId, {
    selectedImageIndex,
    phase: 'MODEL_GENERATION',
    status: 'MODEL_PENDING',
  });

  // 3. 创建 Model 和 ModelGenerationJob
  const modelId = createId();
  const model = await modelRepository.create({
    id: modelId,
    requestId,
    userId: request.userId,
    name: `模型-${requestId.substring(0, 8)}`,
    previewImageUrl: selectedImage.imageUrl,
  });

  const jobId = createId();
  await modelJobRepository.create({
    id: jobId,
    modelId,
    status: 'PENDING',
  });

  // 4. 加入 ModelQueue
  await modelQueue.add(`model-${modelId}`, {
    jobId,
    modelId,
    imageUrl: selectedImage.imageUrl,
    requestId,
    userId: request.userId,
  });

  return { model, selectedImageIndex };
}
```

---

### 阶段 5：Model Worker 处理任务

Model Worker 的处理流程与 Image Worker 类似，但有以下区别：

1. **调用腾讯云图生 3D API**
2. **轮询查询任务状态**（腾讯云任务是异步的）
3. **下载模型文件并上传到 S3**
4. **推送模型生成进度 (model:progress)**

详见 `src/workers/model.worker.ts`。

---

## SSE 事件类型

### Image 相关事件

1. **`image:generating`** - 图片开始生成
   ```json
   {
     "imageId": "xxx",
     "index": 0,
     "prompt": "..."
   }
   ```

2. **`image:completed`** - 图片生成完成
   ```json
   {
     "imageId": "xxx",
     "index": 0,
     "imageUrl": "https://...",
     "completedAt": "2025-12-11T12:00:00.000Z"
   }
   ```

3. **`image:failed`** - 图片生成失败
   ```json
   {
     "imageId": "xxx",
     "index": 0,
     "errorMessage": "..."
   }
   ```

4. **`task:updated`** - 所有图片完成
   ```json
   {
     "requestId": "xxx",
     "status": "IMAGE_COMPLETED",
     "phase": "AWAITING_SELECTION"
   }
   ```

### Model 相关事件

5. **`model:generating`** - 模型开始生成
6. **`model:progress`** - 模型生成进度更新
7. **`model:completed`** - 模型生成完成
8. **`model:failed`** - 模型生成失败

---

## 架构优势

### 相比 Next.js 数据库轮询模式

| 优势 | 说明 |
|------|------|
| **性能更高** | 事件驱动，无需轮询数据库 |
| **扩展性强** | 可独立扩展 Worker 数量 |
| **任务持久化** | Redis 队列保证任务不丢失 |
| **重试机制** | BullMQ 内置指数退避重试 |
| **监控友好** | 可通过 BullBoard 可视化管理队列 |

### 相比纯队列模式

| 优势 | 说明 |
|------|------|
| **数据完整性** | 数据库保存完整的任务状态 |
| **查询方便** | 可通过 SQL 查询任务历史 |
| **数据一致性** | 数据库事务保证数据一致性 |

---

## 关键差异总结

1. **任务创建**
   - Next.js: 创建数据库记录 → Worker 轮询发现
   - Fastify: 创建数据库记录 → 加入队列 → Worker 消费

2. **Worker 启动**
   - Next.js: `instrumentation.ts` 自动启动
   - Fastify: `src/server.ts` 手动启动（必须在应用启动时初始化）

3. **任务调度**
   - Next.js: 每 2 秒轮询数据库
   - Fastify: BullMQ 事件驱动（任务到达立即处理）

4. **数据存储**
   - Next.js: 仅 MySQL
   - Fastify: MySQL（持久化） + Redis（队列）

5. **重试机制**
   - Next.js: 手动实现重试逻辑
   - Fastify: BullMQ 自动重试 + 数据库记录

---

## 最佳实践

1. **Worker 必须在服务器启动时初始化**
   ```typescript
   // ❌ 错误：忘记启动 Workers
   const app = await buildApp();
   await app.listen({ port: 3000 });

   // ✅ 正确：先启动 Workers
   const imageWorker = createImageWorker();
   const modelWorker = createModelWorker();
   const app = await buildApp();
   await app.listen({ port: 3000 });
   ```

2. **队列任务数据只包含关键 ID**
   ```typescript
   // ✅ 正确：只传递 ID
   await imageQueue.add('task', {
     jobId: 'xxx',
     imageId: 'yyy',
     requestId: 'zzz',
   });

   // ❌ 错误：传递完整对象
   await imageQueue.add('task', {
     job: { ...fullJobObject },
     image: { ...fullImageObject },
   });
   ```

3. **Worker 从数据库查询完整信息**
   ```typescript
   // ✅ 正确
   async function processJob(job) {
     const jobData = await imageJobRepository.findById(job.data.jobId);
     const imageData = await generatedImageRepository.findById(job.data.imageId);
     // 处理任务...
   }
   ```

4. **优雅关闭**
   ```typescript
   process.on('SIGTERM', async () => {
     await imageWorker.close();
     await modelWorker.close();
     await app.close();
     await redisClient.disconnect();
   });
   ```

---

## 故障排查

### 问题：任务创建后没有被处理

**可能原因：**
1. ❌ Workers 没有启动（忘记在 `src/server.ts` 中调用 `createImageWorker()` 和 `createModelWorker()`）
2. ❌ Redis 连接失败
3. ❌ 队列名称不匹配

**排查步骤：**
```typescript
// 1. 检查 Workers 是否启动
// 日志应该包含：
// "🚀 Image Worker 启动成功"
// "🚀 Model Worker 启动成功"

// 2. 检查 Redis 队列
await imageQueue.getWaitingCount(); // 应该返回待处理任务数量

// 3. 检查数据库中的 Job 状态
SELECT * FROM image_generation_jobs WHERE status = 'PENDING';
```

### 问题：SSE 没有推送事件

**可能原因：**
1. ❌ SSE 连接未建立
2. ❌ Worker 中忘记调用 `sseConnectionManager.broadcast()`

**排查步骤：**
```typescript
// 检查日志中是否有：
// "建立 SSE 连接"
// "📡 SSE 推送: image:generating"
```

---

## 参考文档

- [Next.js Instrumentation](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Drizzle ORM](https://orm.drizzle.team/)
