# Lumi Web Next - 完整工作流文档

> **版本**: 1.0.0
> **最后更新**: 2025-01-21
> **架构**: Job-Based + 三层任务处理

---

## 📋 目录

1. [核心架构](#核心架构)
2. [数据模型](#数据模型)
3. [完整工作流](#完整工作流)
4. [状态机与状态转换](#状态机与状态转换)
5. [API 接口清单](#api-接口清单)
6. [Worker 配置](#worker-配置)
7. [错误处理](#错误处理)
8. [所有可能的场景](#所有可能的场景)

---

## 🏗️ 核心架构

### 四层架构设计

```
┌───────────────────────────────────────────────────────┐
│                   用户层 (User)                        │
│  - 用户认证                                            │
│  - 用户资产管理                                         │
└────────────────────┬──────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────┐
│              业务层 (Business Layer)                   │
│                                                        │
│  GenerationRequest (请求容器，无状态)                   │
│       ├─ prompt: string                                │
│       ├─ userId: string                                │
│       └─ createdAt, completedAt                        │
│                     ↓                                  │
│  GeneratedImage (图片实体，有独立状态)                  │
│       ├─ imageStatus: ImageStatus ✅                   │
│       ├─ imageUrl: string?                             │
│       ├─ imagePrompt: string?                          │
│       └─ index: 0-3                                    │
│                     ↓                                  │
│  GeneratedModel (3D模型实体，状态通过Job体现)           │
│       ├─ modelUrl: string?                             │
│       ├─ previewImageUrl: string?                      │
│       ├─ format: "OBJ"                                 │
│       └─ sliceTaskId: string? (打印服务)               │
└────────────────────┬──────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────┐
│              执行层 (Execution Layer)                  │
│                                                        │
│  ImageGenerationJob (1:1 with Image)                  │
│       ├─ status: JobStatus ✅                          │
│       ├─ priority: number                              │
│       ├─ retryCount / maxRetries                       │
│       ├─ timeoutAt                                     │
│       └─ providerJobId, providerName                   │
│                                                        │
│  ModelGenerationJob (1:1 with Model)                  │
│       ├─ status: JobStatus ✅                          │
│       ├─ progress: 0-100                               │
│       ├─ priority: number                              │
│       ├─ retryCount / maxRetries                       │
│       ├─ timeoutAt                                     │
│       └─ providerJobId, providerName                   │
└────────────────────┬──────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────┐
│                Worker 层 (Background)                  │
│                                                        │
│  ImageWorker (监听 ImageGenerationJob)                │
│       ├─ 轮询间隔: 2秒                                 │
│       ├─ 并发数: 3 (可配置)                            │
│       └─ 超时: 5分钟 (可配置)                          │
│                                                        │
│  Model3DWorker (监听 ModelGenerationJob)              │
│       ├─ 轮询间隔: 2秒                                 │
│       ├─ 并发数: 1 (可配置)                            │
│       ├─ 超时: 10分钟 (可配置)                         │
│       └─ 腾讯云轮询: 5秒                                │
└───────────────────────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────┐
│              配置层 (Configuration)                    │
│                                                        │
│  QueueConfig (数据库配置，运行时可调整)                 │
│       ├─ maxConcurrency: number                        │
│       ├─ jobTimeout: number (ms)                       │
│       ├─ maxRetries: number                            │
│       ├─ retryDelayBase / retryDelayMax                │
│       ├─ enablePriority: boolean                       │
│       └─ isActive: boolean                             │
└───────────────────────────────────────────────────────┘
```

### 核心原则

| 原则 | 说明 | 优势 |
|------|------|------|
| **业务状态与执行状态分离** | Image.imageStatus (业务) + Job.status (执行) | 清晰的职责划分，易于扩展 |
| **每个实体独立 Job** | 1 Image : 1 ImageGenerationJob | 独立重试、独立状态管理 |
| **三层任务处理** | 超时检测 → 重试调度 → 新任务执行 | 优先级明确，可靠性高 |
| **无手动触发** | Worker 自动监听 Job.status | 解耦 API 和 Worker，易于横向扩展 |
| **动态配置** | QueueConfig 存储在数据库 | 运行时调整，无需重启 |

---

## 📊 数据模型

### 枚举类型

#### ImageStatus (图片业务状态)
```typescript
enum ImageStatus {
  PENDING      // 等待生成
  GENERATING   // 生成中
  COMPLETED    // 已完成
  FAILED       // 失败
}
```

#### JobStatus (任务执行状态)
```typescript
enum JobStatus {
  PENDING    // 等待执行
  RUNNING    // 执行中
  RETRYING   // 重试中（失败后等待重试）
  COMPLETED  // 已完成
  FAILED     // 失败（超过最大重试次数）
  CANCELLED  // 取消
  TIMEOUT    // 超时
}
```

### 核心实体关系

```
User (用户)
  ├─ GenerationRequest[] (生成请求)
  │    ├─ GeneratedImage[0..3] (4张图片)
  │    │    ├─ ImageGenerationJob (1:1)
  │    │    └─ GeneratedModel? (0..1)
  │    │         └─ ModelGenerationJob (1:1)
  │    └─ GeneratedModel[] (所有模型)
  └─ UserAsset[] (用户资产)
       └─ GeneratedModel? (关联AI生成的模型)
```

### 状态字段对比

| 实体 | 状态字段 | 可能值 | 职责 |
|------|---------|--------|------|
| **GenerationRequest** | ❌ 无 | N/A | 容器，管理请求元信息 |
| **GeneratedImage** | ✅ `imageStatus` | PENDING / GENERATING / COMPLETED / FAILED | 图片业务状态 |
| **GeneratedModel** | ❌ 无 (通过Job体现) | N/A | 模型实体 |
| **ImageGenerationJob** | ✅ `status` | PENDING / RUNNING / RETRYING / COMPLETED / FAILED / TIMEOUT | 图片生成执行状态 |
| **ModelGenerationJob** | ✅ `status` + `progress` | PENDING / RUNNING / RETRYING / COMPLETED / FAILED / TIMEOUT + 0-100 | 模型生成执行状态 |

---

## 🔄 完整工作流

### 阶段 1：图片生成流程

#### 1.1 用户发起请求

```
用户输入提示词
    ↓
前端 POST /api/test/requests
{
  "userId": "user-123",
  "prompt": "一只可爱的猫咪"
}
```

#### 1.2 API 层处理 (同步，立即返回)

```typescript
// app/api/test/requests/route.ts

1️⃣ 验证参数
   - userId 非空
   - prompt 非空，长度 <= 500

2️⃣ 调用 Service 层
   GenerationRequestService.createRequest(userId, prompt)

3️⃣ Service 层调用 Repository 层（事务）
   GenerationRequestRepository.createRequestWithImagesAndJobs({
     userId: "user-123",
     prompt: "一只可爱的猫咪"
   })

4️⃣ 数据库事务创建（原子操作）：
   ┌─────────────────────────────────────────────┐
   │ 1个 GenerationRequest                       │
   │   ├─ id: "req-abc123"                       │
   │   ├─ userId: "user-123"                     │
   │   ├─ prompt: "一只可爱的猫咪"                │
   │   └─ createdAt: 2025-01-21 10:00:00         │
   ├─────────────────────────────────────────────┤
   │ 4个 GeneratedImage                          │
   │   ├─ [0] id: "img-0", index: 0              │
   │   │      imageStatus: PENDING               │
   │   │      imageUrl: null                     │
   │   ├─ [1] id: "img-1", index: 1              │
   │   │      imageStatus: PENDING               │
   │   ├─ [2] id: "img-2", index: 2              │
   │   │      imageStatus: PENDING               │
   │   └─ [3] id: "img-3", index: 3              │
   │          imageStatus: PENDING               │
   ├─────────────────────────────────────────────┤
   │ 4个 ImageGenerationJob                      │
   │   ├─ [0] id: "job-0", imageId: "img-0"      │
   │   │      status: PENDING                    │
   │   │      priority: 0                        │
   │   │      retryCount: 0                      │
   │   │      maxRetries: 3                      │
   │   ├─ [1] id: "job-1", imageId: "img-1"      │
   │   │      status: PENDING                    │
   │   ├─ [2] id: "job-2", imageId: "img-2"      │
   │   │      status: PENDING                    │
   │   └─ [3] id: "job-3", imageId: "img-3"      │
   │          status: PENDING                    │
   └─────────────────────────────────────────────┘

5️⃣ 立即返回响应（不等待生成完成）
   {
     "success": true,
     "data": {
       "id": "req-abc123",
       "userId": "user-123",
       "prompt": "一只可爱的猫咪",
       "images": [
         { "id": "img-0", "index": 0, "imageStatus": "PENDING", "imageUrl": null },
         { "id": "img-1", "index": 1, "imageStatus": "PENDING", "imageUrl": null },
         { "id": "img-2", "index": 2, "imageStatus": "PENDING", "imageUrl": null },
         { "id": "img-3", "index": 3, "imageStatus": "PENDING", "imageUrl": null }
       ]
     },
     "message": "生成请求已创建，图片生成任务已加入队列"
   }
```

#### 1.3 Worker 层自动监听 (异步，后台执行)

```typescript
// lib/workers/image-worker.ts

ImageWorker 主循环（每 2 秒执行一次）
┌─────────────────────────────────────────────┐
│  while (isRunning) {                        │
│    // 刷新配置                               │
│    config = await getConfig("image_generation");│
│                                             │
│    // 检查队列是否激活                       │
│    if (!config.isActive) continue;          │
│                                             │
│    // 三层任务处理（按优先级）                │
│    await detectTimeoutJobs();    // Layer 1 │
│    await scheduleRetryJobs();    // Layer 2 │
│    await executeNewJobs();       // Layer 3 │
│                                             │
│    await sleep(2000);                       │
│  }                                          │
└─────────────────────────────────────────────┘
```

##### Layer 1: 超时检测 (最高优先级)

```sql
-- 查询已超时的 RUNNING 任务
SELECT * FROM ImageGenerationJob
WHERE status = 'RUNNING'
  AND timeoutAt <= NOW()
```

```typescript
对每个超时任务：
  if (canRetry(job.retryCount, maxRetries)) {
    // 可以重试
    UPDATE ImageGenerationJob SET
      status = 'RETRYING',
      retryCount = retryCount + 1,
      nextRetryAt = NOW() + calculateRetryDelay(retryCount),
      timeoutedAt = NOW(),
      errorMessage = '任务执行超时',
      errorCode = 'TIMEOUT'
    WHERE id = job.id;

    // Image.imageStatus 保持 GENERATING，不变更
  } else {
    // 超过最大重试次数
    UPDATE ImageGenerationJob SET
      status = 'FAILED',
      failedAt = NOW(),
      timeoutedAt = NOW(),
      errorMessage = '任务执行超时，已达最大重试次数',
      errorCode = 'MAX_RETRIES_EXCEEDED'
    WHERE id = job.id;

    UPDATE GeneratedImage SET
      imageStatus = 'FAILED',
      failedAt = NOW(),
      errorMessage = '图片生成超时失败'
    WHERE id = job.imageId;
  }
```

##### Layer 2: 重试调度 (中等优先级)

```sql
-- 查询到达重试时间的任务
SELECT * FROM ImageGenerationJob
WHERE status = 'RETRYING'
  AND nextRetryAt <= NOW()
  AND id NOT IN (正在处理的任务集合)
LIMIT config.maxConcurrency
```

```typescript
并发处理重试任务（最多 3 个并发）：
  await Promise.all(retryJobs.map(job => processJob(job)));
```

##### Layer 3: 新任务执行 (最低优先级)

```sql
-- 查询待处理任务
SELECT * FROM ImageGenerationJob
WHERE status = 'PENDING'
  AND id NOT IN (正在处理的任务集合)
ORDER BY
  (enablePriority ? priority DESC, createdAt ASC : createdAt ASC)
LIMIT config.maxConcurrency  -- 默认 3
```

```typescript
并发处理新任务（最多 3 个并发）：
  await Promise.all(pendingJobs.map(job => processJob(job)));
```

#### 1.4 单个 Job 处理流程 (processJob)

```typescript
// lib/workers/image-worker.ts

async function processJob(job: ImageGenerationJob) {
  const startTime = Date.now();

  try {
    // ============================================
    // 步骤 1: 更新 Job 状态为 RUNNING
    // ============================================
    UPDATE ImageGenerationJob SET
      status = 'RUNNING',
      startedAt = NOW(),
      timeoutAt = NOW() + config.jobTimeout,  // 默认 5 分钟
      workerNodeId = process.env.WORKER_NODE_ID || 'default'
    WHERE id = job.id;

    // ============================================
    // 步骤 2: 更新 Image 状态为 GENERATING
    // ============================================
    UPDATE GeneratedImage SET
      imageStatus = 'GENERATING'
    WHERE id = job.imageId;

    // ============================================
    // 步骤 3: 执行图片生成 (generateSingleImage)
    // ============================================

    // 3.1 生成 4 个不同风格的提示词 (LLM Provider)
    const promptVariants = await generateMultiStylePrompts(originalPrompt);
    // 返回: [
    //   "一只可爱的猫咪，卡通风格，3D模型，高质量",
    //   "一只可爱的猫咪，写实风格，细节丰富，高分辨率",
    //   "一只可爱的猫咪，简约风格，几何形状，现代设计",
    //   "一只可爱的猫咪，复古风格，温暖色调，手绘质感"
    // ]

    // 3.2 使用对应索引的提示词生成图片 (Image Provider)
    const currentPrompt = promptVariants[job.image.index];  // index = 0-3
    const imageProvider = createImageProvider();  // SiliconFlow / Aliyun / Mock
    const remoteImageUrl = await imageProvider.generateImage(currentPrompt);

    // 3.3 下载图片并上传到存储服务 (Storage Provider)
    const storageUrl = await downloadAndUploadImage(
      remoteImageUrl,
      job.image.requestId,
      job.image.index
    );
    // 存储路径: public/generated/images/{requestId}/{index}.png
    // 或腾讯云 COS: https://bucket.cos.ap-beijing.myqcloud.com/images/{requestId}/{index}.png

    // ============================================
    // 步骤 4: 成功 - 更新 Job 状态为 COMPLETED
    // ============================================
    const executionDuration = Date.now() - startTime;

    UPDATE ImageGenerationJob SET
      status = 'COMPLETED',
      completedAt = NOW(),
      executionDuration = executionDuration
    WHERE id = job.id;

    // ============================================
    // 步骤 5: 成功 - 更新 Image 状态为 COMPLETED
    // ============================================
    UPDATE GeneratedImage SET
      imageStatus = 'COMPLETED',
      imageUrl = storageUrl,
      imagePrompt = currentPrompt,
      completedAt = NOW()
    WHERE id = job.imageId;

    console.log(`✅ 图片生成成功: jobId=${job.id}, imageIndex=${job.image.index}, duration=${executionDuration}ms`);

  } catch (error) {
    // ============================================
    // 错误处理：判断是否可以重试
    // ============================================

    if (canRetry(job.retryCount, config.maxRetries)) {
      // 可以重试（retryCount < 3）
      const retryDelay = calculateRetryDelay(job.retryCount, config);
      // 指数退避：5s, 10s, 20s, 40s, ...，最大 60s

      UPDATE ImageGenerationJob SET
        status = 'RETRYING',
        retryCount = retryCount + 1,
        nextRetryAt = NOW() + retryDelay,
        failedAt = NOW(),
        errorMessage = error.message,
        errorCode = error.code || 'UNKNOWN_ERROR',
        errorStack = error.stack
      WHERE id = job.id;

      // Image.imageStatus 保持 GENERATING，不变更

      console.log(`⚠️ 图片生成失败，安排重试 (${job.retryCount + 1}/${config.maxRetries}): ${error.message}`);

    } else {
      // 超过最大重试次数（retryCount >= 3）

      UPDATE ImageGenerationJob SET
        status = 'FAILED',
        failedAt = NOW(),
        errorMessage = error.message,
        errorCode = error.code || 'UNKNOWN_ERROR',
        errorStack = error.stack
      WHERE id = job.id;

      UPDATE GeneratedImage SET
        imageStatus = 'FAILED',
        failedAt = NOW(),
        errorMessage = error.message
      WHERE id = job.imageId;

      console.error(`❌ 图片生成失败（已达最大重试次数）: ${error.message}`);
    }
  }
}
```

#### 1.5 前端轮询获取结果

```typescript
// 前端每 2 秒轮询一次
GET /api/test/requests/{requestId}

// 返回完整的 GenerationRequest + Images
{
  "success": true,
  "data": {
    "id": "req-abc123",
    "prompt": "一只可爱的猫咪",
    "images": [
      {
        "id": "img-0",
        "index": 0,
        "imageStatus": "COMPLETED",  // ✅ 完成
        "imageUrl": "/generated/images/req-abc123/0.png",
        "imagePrompt": "一只可爱的猫咪，卡通风格...",
        "completedAt": "2025-01-21T10:00:05Z"
      },
      {
        "id": "img-1",
        "index": 1,
        "imageStatus": "GENERATING",  // ⏳ 生成中
        "imageUrl": null
      },
      {
        "id": "img-2",
        "index": 2,
        "imageStatus": "COMPLETED",  // ✅ 完成
        "imageUrl": "/generated/images/req-abc123/2.png"
      },
      {
        "id": "img-3",
        "index": 3,
        "imageStatus": "FAILED",  // ❌ 失败
        "imageUrl": null,
        "errorMessage": "图片生成超时失败"
      }
    ]
  }
}

// 前端显示逻辑
images.forEach(image => {
  if (image.imageStatus === 'COMPLETED') {
    // 显示图片
    renderImage(image.imageUrl);
  } else if (image.imageStatus === 'GENERATING') {
    // 显示加载动画
    showSpinner();
  } else if (image.imageStatus === 'FAILED') {
    // 显示错误信息
    showError(image.errorMessage);
  }
});
```

---

### 阶段 2：3D 模型生成流程

#### 2.1 用户选择图片

```
用户点击第 2 张图片（index=1）
    ↓
前端 POST /api/test/models/generate
{
  "requestId": "req-abc123",
  "sourceImageId": "img-1"
}
```

#### 2.2 API 层处理 (同步，立即返回)

```typescript
// app/api/test/models/generate/route.ts

1️⃣ 验证参数
   - requestId 非空
   - sourceImageId 非空

2️⃣ 调用 Service 层
   GeneratedModelService.createModelForImage(requestId, sourceImageId)

3️⃣ Service 层业务验证
   ├─ 验证图片存在
   ├─ 验证图片属于该请求
   └─ 验证图片未关联模型（一对一）

4️⃣ Repository 层创建（事务）：
   ┌─────────────────────────────────────────────┐
   │ 1个 GeneratedModel                          │
   │   ├─ id: "model-456"                        │
   │   ├─ requestId: "req-abc123"                │
   │   ├─ sourceImageId: "img-1"                 │
   │   ├─ name: "一只可爱的猫咪_1.obj"             │
   │   ├─ modelUrl: null                         │
   │   ├─ format: "OBJ"                          │
   │   └─ createdAt: 2025-01-21 10:05:00         │
   ├─────────────────────────────────────────────┤
   │ 1个 ModelGenerationJob                      │
   │   ├─ id: "job-model-1"                      │
   │   ├─ modelId: "model-456"                   │
   │   ├─ status: PENDING                        │
   │   ├─ priority: 0                            │
   │   ├─ progress: 0                            │
   │   ├─ retryCount: 0                          │
   │   └─ maxRetries: 3                          │
   └─────────────────────────────────────────────┘

5️⃣ 立即返回响应
   {
     "success": true,
     "data": {
       "id": "model-456",
       "sourceImageId": "img-1",
       "name": "一只可爱的猫咪_1.obj",
       "modelUrl": null,
       "generationJob": {
         "status": "PENDING",
         "progress": 0
       }
     },
     "message": "3D 模型生成任务已创建，已加入队列"
   }
```

#### 2.3 Worker 层自动监听 (异步，后台执行)

```typescript
// lib/workers/model3d-worker.ts

Model3DWorker 主循环（每 2 秒执行一次）
┌─────────────────────────────────────────────┐
│  while (isRunning) {                        │
│    config = await getConfig("model_generation");│
│                                             │
│    if (!config.isActive) continue;          │
│                                             │
│    // 三层任务处理                           │
│    await detectTimeoutJobs();    // Layer 1 │
│    await scheduleRetryJobs();    // Layer 2 │
│    await executeNewJobs();       // Layer 3 │
│                                             │
│    await sleep(2000);                       │
│  }                                          │
└─────────────────────────────────────────────┘
```

#### 2.4 单个 Job 处理流程 (processJob)

```typescript
// lib/workers/model3d-worker.ts

async function processJob(job: ModelGenerationJob) {
  const startTime = Date.now();

  try {
    // ============================================
    // 步骤 1: 更新 Job 状态为 RUNNING
    // ============================================
    UPDATE ModelGenerationJob SET
      status = 'RUNNING',
      startedAt = NOW(),
      timeoutAt = NOW() + config.jobTimeout,  // 默认 10 分钟
      workerNodeId = process.env.WORKER_NODE_ID || 'default'
    WHERE id = job.id;

    // ============================================
    // 步骤 2: 验证源图片 URL
    // ============================================
    const sourceImageUrl = job.model.sourceImage.imageUrl;

    if (!sourceImageUrl) {
      throw new Error('源图片 URL 缺失');
    }

    // ============================================
    // 步骤 3: 提交腾讯云混元 3D 任务
    // ============================================
    const model3DProvider = createModel3DProvider();  // Tencent / Mock
    const response = await model3DProvider.submitModelGenerationJob({
      imageUrl: sourceImageUrl
    });

    // 返回: { jobId: "tencent-job-xxx", requestId: "req-xxx" }

    // ============================================
    // 步骤 4: 保存 Provider 的 jobId
    // ============================================
    UPDATE ModelGenerationJob SET
      providerJobId = response.jobId,
      providerRequestId = response.requestId,
      providerName = 'tencent'
    WHERE id = job.id;

    // ============================================
    // 步骤 5: 轮询腾讯云任务状态 (pollModel3DStatus)
    // ============================================
    await pollModel3DStatus(job.id, job.modelId, response.jobId);

    console.log(`✅ 3D 模型生成成功: jobId=${job.id}, modelId=${job.modelId}`);

  } catch (error) {
    // 错误处理（同图片生成）
    if (canRetry(job.retryCount, config.maxRetries)) {
      // 重试
      UPDATE ModelGenerationJob SET status = 'RETRYING', ...;
      UPDATE GeneratedModel SET errorMessage = '生成失败，正在重试';
    } else {
      // 失败
      UPDATE ModelGenerationJob SET status = 'FAILED', ...;
      UPDATE GeneratedModel SET failedAt = NOW(), errorMessage = error.message;
    }
  }
}
```

#### 2.5 轮询腾讯云状态 (pollModel3DStatus)

```typescript
async function pollModel3DStatus(jobId, modelId, providerJobId) {
  const startTime = Date.now();
  let pollCount = 0;

  while (true) {
    pollCount++;
    const elapsed = Date.now() - startTime;

    // ============================================
    // 检查轮询超时（10 分钟）
    // ============================================
    if (elapsed > 600000) {  // 10 分钟
      throw new Error(`轮询超时：已等待 ${Math.floor(elapsed / 1000)} 秒`);
    }

    // ============================================
    // 等待 5 秒后查询
    // ============================================
    await sleep(5000);

    // ============================================
    // 查询腾讯云任务状态
    // ============================================
    const status = await model3DProvider.queryModelTaskStatus(providerJobId);

    // 返回: {
    //   status: "WAIT" | "RUN" | "DONE" | "FAIL",
    //   resultFiles: [{ type: "OBJ", url: "...", previewImageUrl: "..." }],
    //   errorMessage?: string,
    //   errorCode?: string
    // }

    // ============================================
    // 计算进度并更新 Job
    // ============================================
    let progress = 0;
    if (status.status === 'WAIT') progress = 0;
    else if (status.status === 'RUN') progress = 50;
    else if (status.status === 'DONE') progress = 100;

    UPDATE ModelGenerationJob SET progress = progress WHERE id = jobId;

    // ============================================
    // 处理完成状态 (DONE)
    // ============================================
    if (status.status === 'DONE') {
      // 1. 提取 OBJ 文件 URL
      const modelFile = status.resultFiles.find(f => f.type === 'OBJ');

      if (!modelFile?.url) {
        throw new Error('3D 生成返回的结果中没有 OBJ 文件');
      }

      // 2. 下载模型文件
      const modelBuffer = await fetch(modelFile.url).then(r => r.arrayBuffer());

      // 3. 上传到存储服务
      const storageProvider = createStorageProvider();
      const storageUrl = await storageProvider.saveTaskModel({
        taskId: modelId,
        modelData: Buffer.from(modelBuffer),
        format: 'obj'
      });
      // 存储路径: public/generated/models/{modelId}.obj
      // 或腾讯云 COS: https://bucket.cos.ap-beijing.myqcloud.com/models/{modelId}.obj

      // 4. 下载预览图（如果有）
      let previewImageUrl = undefined;
      if (modelFile.previewImageUrl) {
        const previewBuffer = await fetch(modelFile.previewImageUrl).then(r => r.arrayBuffer());
        previewImageUrl = await storageProvider.saveFile({
          taskId: modelId,
          fileName: 'preview.png',
          fileData: Buffer.from(previewBuffer)
        });
      }

      // 5. 更新 Job 状态为 COMPLETED
      const executionDuration = Date.now() - startTime;

      UPDATE ModelGenerationJob SET
        status = 'COMPLETED',
        progress = 100,
        completedAt = NOW(),
        executionDuration = executionDuration
      WHERE id = jobId;

      // 6. 更新 GeneratedModel
      UPDATE GeneratedModel SET
        modelUrl = storageUrl,
        previewImageUrl = previewImageUrl,
        format = 'OBJ',
        completedAt = NOW(),
        errorMessage = null  -- 清除之前的错误信息
      WHERE id = modelId;

      console.log(`✅ 模型生成完成: modelId=${modelId}, 轮询次数=${pollCount}`);
      return;
    }

    // ============================================
    // 处理失败状态 (FAIL)
    // ============================================
    if (status.status === 'FAIL') {
      throw new Error(status.errorMessage || '3D 模型生成失败（返回失败状态）');
    }

    // ============================================
    // 继续轮询 (WAIT 或 RUN 状态)
    // ============================================
    console.log(`⏳ 腾讯云状态: ${status.status}, 进度: ${progress}%, 轮询次数: ${pollCount}`);
  }
}
```

#### 2.6 前端轮询获取结果

```typescript
// 前端每 2 秒轮询一次
GET /api/test/models/{modelId}

// 返回完整的 GeneratedModel + Job
{
  "success": true,
  "data": {
    "id": "model-456",
    "name": "一只可爱的猫咪_1.obj",
    "modelUrl": "/generated/models/model-456.obj",  // ✅ 完成后有值
    "previewImageUrl": "/generated/models/model-456-preview.png",
    "format": "OBJ",
    "completedAt": "2025-01-21T10:07:30Z",
    "generationJob": {
      "status": "COMPLETED",  // ✅ 完成
      "progress": 100,
      "executionDuration": 150000  // 2.5 分钟
    }
  }
}

// 前端显示逻辑
if (model.generationJob.status === 'COMPLETED') {
  // 显示 3D 模型预览和下载按钮
  render3DModel(model.modelUrl);
  showDownloadButton(model.modelUrl);
} else if (model.generationJob.status === 'RUNNING') {
  // 显示进度条
  showProgressBar(model.generationJob.progress);  // 0, 50, 100
} else if (model.generationJob.status === 'FAILED') {
  // 显示错误信息
  showError(model.errorMessage);
}
```

---

## 🔁 状态机与状态转换

### 图片生成状态机

#### ImageStatus (业务状态)

```
PENDING (待生成)
   ↓ (Worker 开始处理)
GENERATING (生成中)
   ├─ (成功) → COMPLETED ✅
   └─ (失败超过重试) → FAILED ❌
```

#### JobStatus (执行状态)

```
PENDING (待执行)
   ↓ (Worker 获取任务)
RUNNING (执行中，设置 timeoutAt)
   ├─ (成功) → COMPLETED ✅
   ├─ (失败，可重试) → RETRYING
   │       ↓ (到达重试时间)
   │    RUNNING → ...
   ├─ (失败，超过重试) → FAILED ❌
   └─ (超时) → RETRYING 或 FAILED
```

### 3D 模型生成状态机

#### GeneratedModel (业务实体)
- **无独立状态字段**，状态通过 `ModelGenerationJob.status` 体现
- `modelUrl` 为 `null` 表示未完成，有值表示已完成
- `failedAt` 非空表示失败

#### JobStatus (执行状态 + 进度)

```
PENDING (progress: 0)
   ↓ (Worker 获取任务)
RUNNING (progress: 0)
   ↓ (提交腾讯云任务)
RUNNING (progress: 0-50-100)
   │
   ├─ 腾讯云状态: WAIT → progress = 0
   ├─ 腾讯云状态: RUN  → progress = 50
   └─ 腾讯云状态: DONE → progress = 100
       ↓ (下载并上传模型)
   COMPLETED ✅

或
   ├─ 腾讯云状态: FAIL → RETRYING 或 FAILED ❌
   └─ 超时 → RETRYING 或 FAILED
```

### 完整状态转换表

| 触发事件 | ImageStatus | JobStatus | 说明 |
|---------|------------|----------|------|
| **创建任务** | PENDING | PENDING | 初始状态 |
| **Worker 开始处理** | PENDING → GENERATING | PENDING → RUNNING | 设置 startedAt, timeoutAt |
| **生成成功** | GENERATING → COMPLETED | RUNNING → COMPLETED | 设置 imageUrl, completedAt |
| **生成失败（可重试）** | 保持 GENERATING | RUNNING → RETRYING | retryCount++, 设置 nextRetryAt |
| **生成失败（超过重试）** | GENERATING → FAILED | RUNNING → FAILED | 设置 failedAt, errorMessage |
| **任务超时（可重试）** | 保持 GENERATING | RUNNING → RETRYING | errorCode: TIMEOUT |
| **任务超时（超过重试）** | GENERATING → FAILED | RUNNING → FAILED | errorCode: MAX_RETRIES_EXCEEDED |
| **重试时间到达** | 保持 GENERATING | RETRYING → RUNNING | 重新执行任务 |

---

## 📡 API 接口清单

### 图片生成相关

#### 1. 创建生成请求

```http
POST /api/test/requests
Content-Type: application/json

{
  "userId": "user-123",
  "prompt": "一只可爱的猫咪"
}

Response 200:
{
  "success": true,
  "data": {
    "id": "req-abc123",
    "userId": "user-123",
    "prompt": "一只可爱的猫咪",
    "createdAt": "2025-01-21T10:00:00Z",
    "images": [
      { "id": "img-0", "index": 0, "imageStatus": "PENDING", "imageUrl": null },
      { "id": "img-1", "index": 1, "imageStatus": "PENDING", "imageUrl": null },
      { "id": "img-2", "index": 2, "imageStatus": "PENDING", "imageUrl": null },
      { "id": "img-3", "index": 3, "imageStatus": "PENDING", "imageUrl": null }
    ]
  },
  "message": "生成请求已创建，图片生成任务已加入队列"
}

Error 400:
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "提示词长度不能超过500个字符"
  }
}
```

#### 2. 获取生成请求详情

```http
GET /api/test/requests/{requestId}

Response 200:
{
  "success": true,
  "data": {
    "id": "req-abc123",
    "prompt": "一只可爱的猫咪",
    "images": [
      {
        "id": "img-0",
        "index": 0,
        "imageStatus": "COMPLETED",
        "imageUrl": "/generated/images/req-abc123/0.png",
        "imagePrompt": "一只可爱的猫咪，卡通风格...",
        "completedAt": "2025-01-21T10:00:05Z",
        "generationJob": {
          "status": "COMPLETED",
          "retryCount": 0,
          "executionDuration": 4000
        }
      },
      // ... 其他 3 张图片
    ]
  }
}

Error 404:
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "生成请求不存在: req-abc123"
  }
}
```

#### 3. 获取用户的生成请求列表

```http
GET /api/test/requests?userId=user-123

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "req-abc123",
      "prompt": "一只可爱的猫咪",
      "createdAt": "2025-01-21T10:00:00Z",
      "images": [...]
    },
    // ... 其他请求
  ]
}
```

### 3D 模型生成相关

#### 4. 创建 3D 模型生成任务

```http
POST /api/test/models/generate
Content-Type: application/json

{
  "requestId": "req-abc123",
  "sourceImageId": "img-1"
}

Response 200:
{
  "success": true,
  "data": {
    "id": "model-456",
    "sourceImageId": "img-1",
    "name": "一只可爱的猫咪_1.obj",
    "modelUrl": null,
    "generationJob": {
      "status": "PENDING",
      "progress": 0
    }
  },
  "message": "3D 模型生成任务已创建，已加入队列"
}

Error 409:
{
  "success": false,
  "error": {
    "code": "INVALID_STATE",
    "message": "该图片已有关联模型，每张图片只能生成一个3D模型",
    "details": {
      "existingModelId": "model-789",
      "sourceImageId": "img-1"
    }
  }
}
```

#### 5. 获取模型详情

```http
GET /api/test/models/{modelId}

Response 200:
{
  "success": true,
  "data": {
    "id": "model-456",
    "name": "一只可爱的猫咪_1.obj",
    "modelUrl": "/generated/models/model-456.obj",
    "previewImageUrl": "/generated/models/model-456-preview.png",
    "format": "OBJ",
    "completedAt": "2025-01-21T10:07:30Z",
    "sourceImage": {
      "id": "img-1",
      "imageUrl": "/generated/images/req-abc123/1.png"
    },
    "generationJob": {
      "status": "COMPLETED",
      "progress": 100,
      "executionDuration": 150000
    }
  }
}
```

### Worker 监控相关

#### 6. 获取 Worker 状态

```http
GET /api/workers/status

Response 200:
{
  "success": true,
  "data": {
    "image": {
      "isRunning": true,
      "processingCount": 2,
      "processingJobIds": ["job-0", "job-1"],
      "config": {
        "maxConcurrency": 3,
        "jobTimeout": 300000,
        "maxRetries": 3,
        "isActive": true
      }
    },
    "model3d": {
      "isRunning": true,
      "processingCount": 1,
      "processingJobIds": ["job-model-1"],
      "config": {
        "maxConcurrency": 1,
        "jobTimeout": 600000,
        "maxRetries": 3,
        "isActive": true
      }
    }
  }
}
```

---

## ⚙️ Worker 配置

### QueueConfig 表结构

```typescript
{
  queueName: "image_generation" | "model_generation",

  // 并发控制
  maxConcurrency: number,     // 最大并发数

  // 超时控制
  jobTimeout: number,         // 单个 Job 超时时间（毫秒）

  // 重试策略
  maxRetries: number,         // 最大重试次数
  retryDelayBase: number,     // 重试基础延迟（毫秒）
  retryDelayMax: number,      // 重试最大延迟（毫秒）

  // 优先级
  enablePriority: boolean,    // 是否启用优先级排序

  // 队列状态
  isActive: boolean,          // 队列是否激活

  // 元数据
  createdAt: DateTime,
  updatedAt: DateTime,
  updatedBy: string?
}
```

### 默认配置

#### 图片生成队列

```typescript
{
  queueName: "image_generation",
  maxConcurrency: 3,          // 并发 3 个图片任务
  jobTimeout: 300000,         // 5 分钟超时
  maxRetries: 3,              // 最多重试 3 次
  retryDelayBase: 5000,       // 重试基础延迟 5 秒
  retryDelayMax: 60000,       // 重试最大延迟 60 秒
  enablePriority: false,      // 不启用优先级
  isActive: true              // 队列激活
}
```

#### 3D 模型生成队列

```typescript
{
  queueName: "model_generation",
  maxConcurrency: 1,          // 并发 1 个模型任务（耗时长）
  jobTimeout: 600000,         // 10 分钟超时
  maxRetries: 3,
  retryDelayBase: 5000,
  retryDelayMax: 60000,
  enablePriority: false,
  isActive: true
}
```

### 静态配置（代码中定义）

```typescript
// lib/workers/image-worker.ts
const CONFIG = {
  POLL_INTERVAL: 2000,        // Worker 轮询数据库间隔（2秒）
};

// lib/workers/model3d-worker.ts
const CONFIG = {
  POLL_INTERVAL: 2000,              // Worker 轮询数据库间隔（2秒）
  TENCENT_POLL_INTERVAL: 5000,      // 轮询腾讯云状态间隔（5秒）
  MAX_TENCENT_POLL_TIME: 600000,    // 最大轮询腾讯云时间（10分钟）
};
```

### 重试延迟计算（指数退避）

```typescript
function calculateRetryDelay(retryCount: number, config: WorkerConfig): number {
  // 指数退避：baseDelay * (2 ^ retryCount)
  const delay = config.retryDelayBase * Math.pow(2, retryCount);

  // 限制最大延迟
  return Math.min(delay, config.retryDelayMax);
}

// 示例：
retryDelayBase = 5000, retryDelayMax = 60000

retryCount = 0 → delay = 5000 * 2^0 = 5000ms   (5秒)
retryCount = 1 → delay = 5000 * 2^1 = 10000ms  (10秒)
retryCount = 2 → delay = 5000 * 2^2 = 20000ms  (20秒)
retryCount = 3 → delay = 5000 * 2^3 = 40000ms  (40秒)
retryCount = 4 → delay = 5000 * 2^4 = 80000ms → min(80000, 60000) = 60000ms (60秒)
```

---

## ❌ 错误处理

### 错误代码清单

| 错误码 | HTTP 状态码 | 说明 | 场景 |
|-------|-----------|------|------|
| `VALIDATION_ERROR` | 400 | 输入验证失败 | 提示词为空、长度超限 |
| `NOT_FOUND` | 404 | 资源不存在 | 请求/图片/模型不存在 |
| `INVALID_STATE` | 409 | 状态不允许操作 | 图片已有关联模型 |
| `TIMEOUT` | - | 任务执行超时 | Job 超过 timeoutAt |
| `MAX_RETRIES_EXCEEDED` | - | 超过最大重试次数 | retryCount >= maxRetries |
| `EXTERNAL_API_ERROR` | 500 | 外部 API 错误 | 腾讯云/SiliconFlow API 失败 |
| `UNKNOWN_ERROR` | 500 | 未知错误 | 其他未分类错误 |

### 错误响应格式

```typescript
// 成功响应
{
  "success": true,
  "data": { ... }
}

// 错误响应
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "提示词长度不能超过500个字符",
    "details": {
      "maxLength": 500,
      "actualLength": 520
    }
  }
}
```

### Job 错误字段

```typescript
{
  errorMessage: string,  // 错误消息
  errorCode: string,     // 错误码
  errorStack: string,    // 错误堆栈（调试用）
  failedAt: DateTime,    // 失败时间
  timeoutedAt: DateTime  // 超时时间
}
```

---

## 🔍 所有可能的场景

### 场景 1：图片生成 - 全部成功

```
用户创建请求
  ↓
API 创建: 1 Request + 4 Images (PENDING) + 4 Jobs (PENDING)
  ↓
ImageWorker 监听到 4 个 PENDING Jobs
  ↓
并发处理 3 个 Jobs (第 4 个等待)
  ├─ Job[0]: PENDING → RUNNING → COMPLETED (4.2s)
  ├─ Job[1]: PENDING → RUNNING → COMPLETED (4.5s)
  └─ Job[2]: PENDING → RUNNING → COMPLETED (4.1s)
  ↓
处理第 4 个 Job
  └─ Job[3]: PENDING → RUNNING → COMPLETED (4.3s)
  ↓
前端轮询获取: 4 张图片全部 COMPLETED ✅
```

**最终状态**:
- GenerationRequest: completedAt 设置
- GeneratedImage[0-3]: imageStatus = COMPLETED, imageUrl 有值
- ImageGenerationJob[0-3]: status = COMPLETED

---

### 场景 2：图片生成 - 部分失败（可重试）

```
用户创建请求
  ↓
API 创建: 1 Request + 4 Images (PENDING) + 4 Jobs (PENDING)
  ↓
ImageWorker 并发处理
  ├─ Job[0]: PENDING → RUNNING → COMPLETED ✅
  ├─ Job[1]: PENDING → RUNNING → 生成失败（网络错误）
  │          → RETRYING (retryCount=1, nextRetryAt=now+5s)
  ├─ Job[2]: PENDING → RUNNING → COMPLETED ✅
  └─ Job[3]: PENDING → RUNNING → COMPLETED ✅
  ↓
等待 5 秒后，重试调度层检测到 Job[1]
  └─ Job[1]: RETRYING → RUNNING → COMPLETED ✅
  ↓
前端轮询获取: 4 张图片全部 COMPLETED ✅
```

**中间状态** (5秒内):
- GeneratedImage[1]: imageStatus = GENERATING (保持)
- ImageGenerationJob[1]: status = RETRYING, retryCount = 1

**最终状态**:
- 全部成功

---

### 场景 3：图片生成 - 部分失败（超过重试）

```
用户创建请求
  ↓
ImageWorker 并发处理
  ├─ Job[0]: PENDING → RUNNING → COMPLETED ✅
  ├─ Job[1]: PENDING → RUNNING → 失败
  │          → RETRYING (retryCount=1) → RUNNING → 失败
  │          → RETRYING (retryCount=2) → RUNNING → 失败
  │          → RETRYING (retryCount=3) → RUNNING → 失败
  │          → FAILED ❌ (retryCount=3 >= maxRetries=3)
  ├─ Job[2]: PENDING → RUNNING → COMPLETED ✅
  └─ Job[3]: PENDING → RUNNING → COMPLETED ✅
  ↓
前端轮询获取: 3 张成功，1 张失败
```

**最终状态**:
- GeneratedImage[1]: imageStatus = FAILED, errorMessage 设置
- ImageGenerationJob[1]: status = FAILED, retryCount = 3

---

### 场景 4：图片生成 - 任务超时

```
用户创建请求
  ↓
ImageWorker 并发处理
  ├─ Job[0]: PENDING → RUNNING (timeoutAt = now + 5min)
  │          → 5分钟后仍在执行
  │          → 超时检测层标记为 RETRYING
  │          → RUNNING → COMPLETED ✅
  ├─ Job[1-3]: 正常完成
  ↓
前端轮询获取: 4 张图片全部 COMPLETED ✅
```

**超时处理**:
```typescript
detectTimeoutJobs() 检测到 Job[0].timeoutAt <= now
  ↓
if (canRetry(0, 3)) {
  UPDATE Job[0] SET
    status = 'RETRYING',
    retryCount = 1,
    nextRetryAt = now + 5s,
    errorCode = 'TIMEOUT';
}
```

---

### 场景 5：3D 模型生成 - 成功

```
用户选择图片
  ↓
API 创建: 1 Model + 1 Job (PENDING)
  ↓
Model3DWorker 监听到 PENDING Job
  ↓
Job: PENDING → RUNNING
  ↓
提交腾讯云任务 (获得 providerJobId)
  ↓
轮询腾讯云状态:
  ├─ WAIT (progress=0)   → 等待 5s
  ├─ RUN  (progress=50)  → 等待 5s → 等待 5s → ...
  └─ DONE (progress=100)
  ↓
下载模型文件 (OBJ) 并上传到存储
  ↓
Job: RUNNING → COMPLETED
Model: modelUrl 设置
  ↓
前端轮询获取: 模型 COMPLETED ✅
```

**最终状态**:
- GeneratedModel: modelUrl 有值, completedAt 设置
- ModelGenerationJob: status = COMPLETED, progress = 100

---

### 场景 6：3D 模型生成 - 腾讯云返回失败

```
用户选择图片
  ↓
Model3DWorker 处理
  ↓
轮询腾讯云状态:
  ├─ WAIT → RUN → FAIL (errorMessage: "图片质量不符合要求")
  ↓
抛出异常: "3D 模型生成失败（返回失败状态）"
  ↓
错误处理: canRetry(0, 3) = true
  ↓
Job: RUNNING → RETRYING (retryCount=1, nextRetryAt=now+5s)
Model: errorMessage = "3D 模型生成失败，正在重试"
  ↓
重试调度: RETRYING → RUNNING → ... → 成功或失败
```

---

### 场景 7：3D 模型生成 - 轮询超时

```
Model3DWorker 处理
  ↓
轮询腾讯云状态:
  ├─ WAIT → RUN → RUN → ... (持续 10 分钟)
  ↓
检测到轮询超时 (elapsed > 600000ms)
  ↓
抛出异常: "轮询超时：已等待 600 秒"
  ↓
错误处理: 重试或失败
```

---

### 场景 8：队列暂停与恢复

```
管理员暂停队列
  ↓
POST /api/admin/queues/image_generation/pause
  ↓
UPDATE QueueConfig SET isActive = false
  ↓
Worker 主循环检测到 config.isActive = false
  ↓
跳过任务处理，继续等待
  ↓
管理员恢复队列
  ↓
POST /api/admin/queues/image_generation/resume
  ↓
UPDATE QueueConfig SET isActive = true
  ↓
Worker 恢复任务处理
```

---

### 场景 9：动态调整并发数

```
管理员调整并发数
  ↓
PATCH /api/admin/queues/image_generation
{ "maxConcurrency": 5 }
  ↓
UPDATE QueueConfig SET maxConcurrency = 5
  ↓
Worker 下次轮询时刷新配置
  ↓
从原来的 3 个并发增加到 5 个并发
```

---

### 场景 10：图片已有关联模型（业务校验）

```
用户选择图片 img-1
  ↓
POST /api/test/models/generate
{ "sourceImageId": "img-1" }
  ↓
Service 层校验:
  existingModel = findModelBySourceImageId("img-1")
  if (existingModel) throw AppError("INVALID_STATE", ...)
  ↓
返回 409 错误:
{
  "success": false,
  "error": {
    "code": "INVALID_STATE",
    "message": "该图片已有关联模型，每张图片只能生成一个3D模型",
    "details": {
      "existingModelId": "model-789",
      "sourceImageId": "img-1"
    }
  }
}
```

---

### 场景 11：多用户并发请求

```
User A 创建请求 req-A (4 images)
User B 创建请求 req-B (4 images)
User C 创建请求 req-C (4 images)
  ↓
数据库中有 12 个 PENDING Jobs
  ↓
ImageWorker 轮询:
  ├─ 第 1 轮: 并发处理 3 个 Jobs (req-A 的前 3 张)
  ├─ 第 2 轮: 并发处理 3 个 Jobs (req-A 的第 4 张 + req-B 的前 2 张)
  ├─ 第 3 轮: 并发处理 3 个 Jobs (req-B 的后 2 张 + req-C 的第 1 张)
  └─ 第 4 轮: 并发处理 3 个 Jobs (req-C 的后 3 张)
  ↓
所有用户的请求都会被公平处理（按创建时间排序）
```

---

### 场景 12：优先级队列

```
配置启用优先级
  ↓
UPDATE QueueConfig SET enablePriority = true
  ↓
用户创建请求并设置优先级
  ↓
Job[0]: priority = 10 (VIP 用户)
Job[1]: priority = 5  (普通用户)
Job[2]: priority = 0  (默认)
  ↓
Worker 查询任务:
  ORDER BY priority DESC, createdAt ASC
  ↓
处理顺序: Job[0] (priority=10) → Job[1] (priority=5) → Job[2] (priority=0)
```

---

## 📝 总结

### 核心优势

| 特性 | 优势 |
|------|------|
| **Job-Based 架构** | 每个业务实体独立 Job，状态管理清晰 |
| **三层任务处理** | 超时检测、重试调度、新任务执行优先级明确 |
| **动态配置** | 运行时调整并发数、超时时间、重试策略 |
| **指数退避重试** | 避免频繁重试，减轻服务压力 |
| **横向扩展** | Worker 无状态，可部署多实例 |
| **监控友好** | 完整的日志、状态字段、监控接口 |

### 关键数字

- **图片生成并发**: 3 (可配置)
- **图片生成超时**: 5 分钟 (可配置)
- **3D 模型生成并发**: 1 (可配置)
- **3D 模型生成超时**: 10 分钟 (可配置)
- **最大重试次数**: 3 (可配置)
- **重试延迟**: 5s → 10s → 20s → 40s → 60s (指数退避)
- **Worker 轮询间隔**: 2 秒
- **腾讯云轮询间隔**: 5 秒

---

**文档版本**: 1.0.0
**创建日期**: 2025-01-21
**维护者**: Lumi Web Next 团队
