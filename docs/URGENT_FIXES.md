# 紧急问题修复计划

> 创建日期: 2025-12-18  
> 分析基于: lumi-server 当前代码库  
> 状态: 待修复

---

## 📋 概述

本文档记录了项目中发现的 5 个最紧急的安全和稳定性问题，按严重程度排序。这些问题都是**生产环境不可接受**的缺陷，需要优先修复。

---

## 🚨 问题清单

### 1. 认证系统存在严重安全漏洞 ⚠️

**严重程度**: 🔴 **CRITICAL**  
**影响**: 安全漏洞 - 完全绕过权限控制  
**修复时间**: 本周必须完成

#### 问题描述

认证中间件将用户信息写入 `request.headers`，这些 headers 可以被客户端伪造，导致：
- 攻击者可以修改请求头冒充任意用户
- 可以删除他人的生成请求
- 可以访问他人的私有数据
- 完全绕过业务权限控制

#### 问题位置

**文件**: `src/middleware/auth.middleware.ts`  
**行数**: 63-65

**问题代码**:
```typescript
// 当前实现 - 不安全！
request.headers['x-user-id'] = externalUser.user_id;
request.headers['x-external-user-id'] = externalUser.user_id;
request.headers['x-user-email'] = externalUser.email;
```

#### 影响范围

- `src/middleware/auth.middleware.ts` - 核心认证逻辑
- `src/routes/auth.route.ts` - 路由层依赖这些 headers
- `src/services/*.service.ts` - 所有服务层读取 `x-user-id`

#### 修复方案

**1. 扩展 FastifyRequest 类型**

在 `src/types/fastify.d.ts` (新建文件) 中声明:
```typescript
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      userName: string;
    };
  }
}
```

**2. 修改认证中间件**

在 `src/middleware/auth.middleware.ts` 中:
```typescript
// ✅ 正确 - 使用 request 对象属性
request.user = {
  id: externalUser.user_id,
  email: externalUser.email,
  userName: externalUser.user_name
};

// ❌ 删除所有 request.headers['x-user-id'] = ... 的代码
```

**3. 更新所有读取用户 ID 的代码**

全局搜索并替换:
- `request.headers['x-user-id']` → `request.user?.id`
- `request.headers['x-external-user-id']` → `request.user?.id`
- `request.headers['x-user-email']` → `request.user?.email`

**4. 添加类型检查**

在需要用户信息的路由处理器中:
```typescript
if (!request.user) {
  throw new UnauthorizedError('用户未认证');
}
const userId = request.user.id; // TypeScript 类型安全
```

#### 验证步骤

1. 启动服务器，尝试手动设置 `x-user-id` header 访问受保护资源
2. 确认返回 401 Unauthorized
3. 通过正常认证流程验证功能正常
4. 运行集成测试确保所有路由正常工作

---

### 2. Redis 连接无限重试导致资源泄漏

**严重程度**: 🔴 **HIGH**  
**影响**: 稳定性问题 - 生产环境可能雪崩  
**修复时间**: 本周必须完成

#### 问题描述

Redis 客户端在连接失败时会无限重试，没有最大次数限制：
- 在 Redis 服务长期不可用时持续占用资源
- Worker 异常退出时连接可能未正确关闭
- 可能导致内存和文件描述符泄漏

#### 问题位置

**文件**: `src/utils/redis-client.ts`  
**行数**: 13-16

**问题代码**:
```typescript
retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis retry attempt ${times}, delay: ${delay}ms`);
    return delay; // 永远返回数字 = 永远重试
}
```

#### 影响范围

- `src/utils/redis-client.ts` - Redis 连接管理
- `src/workers/start-workers.ts` - Worker 进程依赖 Redis
- `src/queues/*.ts` - 所有队列依赖 Redis

#### 修复方案

**1. 添加最大重试次数限制**

```typescript
retryStrategy: (times) => {
    const maxRetries = 50; // 约 50 秒后放弃
    
    if (times > maxRetries) {
        logger.error({
            attempts: times,
            maxRetries
        }, 'Redis 重试次数超过限制，停止重试');
        return null; // 返回 null 停止重试
    }
    
    const delay = Math.min(times * 50, 2000);
    logger.warn({
        attempt: times,
        delay,
        maxRetries
    }, 'Redis 连接重试中');
    
    return delay;
}
```

**2. 添加连接健康检查**

```typescript
export async function checkRedisHealth(): Promise<boolean> {
    try {
        await redisClient.ping();
        return true;
    } catch (error) {
        logger.error({ error }, 'Redis 健康检查失败');
        return false;
    }
}
```

**3. 优雅关闭处理**

在 `src/workers/start-workers.ts` 中:
```typescript
async function gracefulShutdown() {
    logger.info('收到关闭信号，开始优雅关闭...');
    
    // 1. 停止接收新任务
    await imageWorker.close();
    await modelWorker.close();
    
    // 2. 等待当��任务完成（最多 30 秒）
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // 3. 关闭 Redis 连接
    await redisClient.quit();
    await redisConnection.quit();
    
    logger.info('优雅关闭完成');
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

**4. S3 客户端添加超时**

在 `src/services/storage.service.ts` 中:
```typescript
import { S3Client } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
    region: config.s3.region,
    credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
    },
    endpoint: config.s3.endpoint,
    requestHandler: {
        requestTimeout: 30000, // 30 秒超时
        httpsAgent: {
            maxSockets: 50, // 连接池限制
        }
    }
});
```

#### 验证步骤

1. 关闭 Redis 服务，启动 Worker
2. 观察日志确认在 50 次重试后停止
3. 测试 `SIGTERM` 信号优雅关闭功能
4. 使用 `lsof` 命令检查进程退出后无残留连接

---

### 3. Worker 任务失败处理不完善

**严重程度**: 🟠 **HIGH**  
**影响**: 用户体验 - 任务"消失"  
**修复时间**: 2 周内完成

#### 问题描述

Worker 在处理任务失败时的问题：
- 最终失败的任务会从队列中消失，无法追踪
- 没有实现死信队列（Dead Letter Queue）保存最终失败的任务
- 外部 API 调用超时没有主动取消任务
- SSE 推送失败可能导致前端状态不一致

#### 问题位置

**文件**: `src/workers/image.worker.ts`, `src/workers/model.worker.ts`  
**行数**: 127-138 (image.worker.ts)

**问题代码**:
```typescript
} catch (error) {
    // 错误处理后直接 throw，让 BullMQ 处理重试
    // 但如果是最后一次重试，任务会从队列中消失
    throw error;
}
```

#### 影响范围

- `src/workers/image.worker.ts` - 图片生成 Worker
- `src/workers/model.worker.ts` - 模型生成 Worker
- `src/queues/image-queue.ts` - 图片队列配置
- `src/queues/model-queue.ts` - 模型队列配置

#### 修复方案

**1. 创建死信队列**

在 `src/queues/dead-letter-queue.ts` (新建文件):
```typescript
import { Queue } from 'bullmq';
import { redisConnection } from '@/utils/redis-client';

export interface DeadLetterJob {
    originalQueue: string;
    jobId: string;
    jobData: any;
    error: string;
    failedAt: Date;
    attempts: number;
}

export const deadLetterQueue = new Queue<DeadLetterJob>('dead-letter', {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: false, // 保留记录用于分析
        removeOnFail: false,
    }
});
```

**2. 在 Worker 中添加 failed 事件处理**

在 `src/workers/image.worker.ts` 中:
```typescript
import { deadLetterQueue } from '@/queues/dead-letter-queue';

imageWorker.on('failed', async (job, err) => {
    if (!job) return;
    
    logger.error({
        jobId: job.id,
        requestId: job.data.requestId,
        error: err,
        attemptsMade: job.attemptsMade,
        maxAttempts: 3
    }, 'Image job 最终失败');
    
    // 如果是最后一次重试失败，加入死信队列
    if (job.attemptsMade >= 3) {
        await deadLetterQueue.add('failed-image-job', {
            originalQueue: 'image-queue',
            jobId: job.id,
            jobData: job.data,
            error: err.message,
            failedAt: new Date(),
            attempts: job.attemptsMade
        });
        
        logger.info({
            jobId: job.id,
            requestId: job.data.requestId
        }, '任务已加入死信队列');
    }
});
```

**3. 添加任务超时机制**

在队列配置中添加超时:
```typescript
// src/queues/image-queue.ts
export const imageQueue = new Queue('image-queue', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        timeout: 600000, // 10 分钟超时
        removeOnComplete: {
            age: 86400, // 24 小时后删除成功任务
            count: 1000, // 最多保留 1000 个
        },
        removeOnFail: false, // 失败任务不自动删除
    }
});
```

**4. SSE 推送失败降级处理**

在 Worker 中:
```typescript
// 推送状态更新
try {
    await sseManager.sendUpdate(userId, {
        type: 'IMAGE_COMPLETED',
        data: { requestId, images }
    });
} catch (sseError) {
    // SSE 推送失败不影响任务状态
    logger.warn({
        error: sseError,
        requestId,
        userId
    }, 'SSE 推送失败，客户端需要主动拉取');
    // 不抛出错误，任务继续完成
}
```

**5. 创建死信队列监控端点**

在 `src/routes/workers.route.ts` 中添加:
```typescript
app.get('/api/workers/dead-letter', {
    schema: {
        tags: ['Workers'],
        summary: '查看死信队列'
    }
}, async (request, reply) => {
    const jobs = await deadLetterQueue.getJobs(['completed', 'failed']);
    
    return reply.jsendSuccess({
        total: jobs.length,
        jobs: jobs.map(job => ({
            id: job.id,
            originalQueue: job.data.originalQueue,
            error: job.data.error,
            failedAt: job.data.failedAt,
            attempts: job.data.attempts
        }))
    });
});
```

#### 验证步骤

1. 模拟外部 API 失败（修改 Provider 返回错误）
2. 提交任务并观察 3 次重试后进入死信队列
3. 访问 `/api/workers/dead-letter` 确认任务记录存在
4. 测试 SSE 推送失败不影响任务完成

---

### 4. 数据库事务缺失导致数据不一致

**严重程度**: 🟠 **HIGH**  
**影响**: 数据一致性问题  
**修复时间**: 2 周内完成

#### 问题描述

`selectImageAndGenerateModel` 函数执行多个关联操作但没有事务保护：
- 更新 GenerationRequest 状态
- 创建 GeneratedModel 记录
- 创建 ModelJob 记录
- 将任务加入队列

如果中间步骤失败，会导致数据不一致：
- 数据库显示"生成中"但队列里没任务
- 模型记录创建了但 Job 记录未创建
- 前端永远显示加载状态

#### 问题位置

**文件**: `src/services/generation-request.service.ts`  
**行数**: 176-218 (selectImageAndGenerateModel 函数)

**问题代码**:
```typescript
// 没有事务保护！
await generationRequestRepository.update(requestId, {...}); // 1
const model = await modelRepository.create({...}); // 2
await modelJobRepository.create({...}); // 3
await modelQueue.add(...); // 4
// 如果步骤 3 或 4 失败，步骤 1 和 2 已经生效
```

#### 影响范围

- `src/services/generation-request.service.ts` - 核心业务逻辑
- `src/repositories/*.repository.ts` - 需要支持事务
- `src/db/drizzle.ts` - 数据库连接

#### 修复方案

**1. 在 Repository 中添加事务支持**

在 `src/repositories/base.repository.ts` (新建文件):
```typescript
import { db } from '@/db/drizzle';
import type { MySqlTransaction } from 'drizzle-orm/mysql-core';

export type TransactionContext = MySqlTransaction<any, any, any>;

export abstract class BaseRepository {
    protected getDb(tx?: TransactionContext) {
        return tx || db;
    }
}
```

**2. 修改 Repository 方法支持传入事务**

示例 (GenerationRequestRepository):
```typescript
export class GenerationRequestRepository extends BaseRepository {
    async update(
        id: string,
        data: Partial<GenerationRequest>,
        tx?: TransactionContext
    ) {
        const database = this.getDb(tx);
        
        const [updated] = await database
            .update(generationRequests)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(generationRequests.id, id))
            .returning();
            
        return updated;
    }
}
```

**3. 在 Service 中使用事务**

修改 `selectImageAndGenerateModel`:
```typescript
async selectImageAndGenerateModel(
    requestId: string,
    imageId: string,
    userId: string
): Promise<GeneratedModel> {
    // 使用事务包裹所有数据库操作
    return await db.transaction(async (tx) => {
        // 1. 更新 GenerationRequest
        await generationRequestRepository.update(
            requestId,
            {
                status: RequestStatus.MODEL_PENDING,
                phase: RequestPhase.MODEL_GENERATION,
                selectedImageId: imageId,
            },
            tx // 传入事务上下文
        );

        // 2. 创建 GeneratedModel
        const model = await modelRepository.create(
            {
                requestId,
                selectedImageId: imageId,
                modelStatus: ModelStatus.PENDING,
                userId,
            },
            tx
        );

        // 3. 创建 ModelJob
        await modelJobRepository.create(
            {
                modelId: model.id,
                status: ModelJobStatus.PENDING,
            },
            tx
        );

        // 4. 加入队列（在事务外，因为 Redis 不支持回滚）
        // 将在事务提交后执行
        return model;
    }).then(async (model) => {
        // 事务成功提交后，将任务加入队列
        await modelQueue.add('generate-model', {
            modelId: model.id,
            requestId,
            imageId,
        });
        
        return model;
    });
}
```

**4. 修改 deleteRequest 的 S3 清理顺序**

```typescript
async deleteRequest(requestId: string, userId: string): Promise<void> {
    const request = await this.getRequestById(requestId, userId);
    
    // 策略：先删数据库，后删 S3
    // 原因：数据库删除可以回滚，S3 删除难以回滚
    
    await db.transaction(async (tx) => {
        // 删除关联数据
        await generatedImageRepository.deleteByRequestId(requestId, tx);
        await modelRepository.deleteByRequestId(requestId, tx);
        await generationRequestRepository.delete(requestId, tx);
    });
    
    // 数据库删除成功后，异步清理 S3 文件
    // 即使 S3 清理失败，也不影响数据库一致性
    // 可以通过定期任务清理孤立文件
    this.cleanupS3Files(request).catch(error => {
        logger.error({
            error,
            requestId,
            userId
        }, 'S3 文件清理失败，将由定期任务处理');
    });
}

private async cleanupS3Files(request: GenerationRequest): Promise<void> {
    const images = await generatedImageRepository.findByRequestId(request.id);
    const models = await modelRepository.findByRequestId(request.id);
    
    for (const image of images) {
        if (image.imageUrl) {
            await storageService.deleteFile(image.imageUrl);
        }
    }
    
    for (const model of models) {
        if (model.modelUrl) await storageService.deleteFile(model.modelUrl);
        if (model.mtlUrl) await storageService.deleteFile(model.mtlUrl);
        if (model.textureUrl) await storageService.deleteFile(model.textureUrl);
    }
}
```

**5. 创建 S3 孤立文件清理任务**

在 `src/jobs/cleanup-orphaned-files.ts` (新建文件):
```typescript
import { CronJob } from 'cron';
import { logger } from '@/utils/logger';
import { storageService } from '@/services/storage.service';
import { db } from '@/db/drizzle';

// 每天凌晨 3 点运行
export const cleanupOrphanedFilesJob = new CronJob('0 3 * * *', async () => {
    logger.info('开始清理 S3 孤立文件');
    
    try {
        // 1. 获取 S3 中所有文件
        const s3Files = await storageService.listAllFiles();
        
        // 2. 获取数据库中所有引用的文件
        const dbFiles = await db.query.generatedImages.findMany({
            columns: { imageUrl: true }
        });
        
        const dbUrls = new Set(dbFiles.map(f => f.imageUrl).filter(Boolean));
        
        // 3. 找出孤立文件并删除
        for (const s3File of s3Files) {
            if (!dbUrls.has(s3File.url)) {
                await storageService.deleteFile(s3File.url);
                logger.info({ url: s3File.url }, '删除孤立文件');
            }
        }
        
        logger.info('S3 孤立文件清理完成');
    } catch (error) {
        logger.error({ error }, 'S3 孤立文件清理失败');
    }
});
```

#### 验证步骤

1. 在事务中间步骤抛出错误，确认所有操作回滚
2. 测试删除请求后 S3 文件被清理
3. 模拟 S3 删除失败，确认不影响数据库删除
4. 验证事务提交后队列任务正确添加

---

### 5. 配置验证不足，生产环境启动风险

**严重程度**: 🟡 **MEDIUM**  
**影响**: 部署问题 - 运行时才发现配置缺失  
**修复时间**: 2 周内完成

#### 问题描述

关键配置项的验证不足：
- 所有 AI Provider API Key 都是 `optional()`
- 服务启动成功但运行时才发现缺少配置
- 用户提交任务后才报错，体验极差
- `PUBLIC_URL` 是可选的但在代理 URL 功能中被依赖

#### 问题位置

**文件**: `src/config/index.ts`  
**行数**: 28-35

**问题代码**:
```typescript
// 所有都是可选的！
ALIYUN_IMAGE_API_KEY: z.string().optional(),
TENCENTCLOUD_SECRET_ID: z.string().optional(),
TENCENTCLOUD_SECRET_KEY: z.string().optional(),
SILICONFLOW_API_KEY: z.string().optional(),
```

#### 影响范围

- `src/config/index.ts` - 配置验证
- `src/providers/image/*` - 依赖 API Key
- `src/providers/model3d/*` - 依赖 API Key
- `src/server.ts` - 启动时配置加载

#### 修复方案

**1. 区分开发和生产环境验证规则**

```typescript
// src/config/index.ts
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    
    // 数据库 - 始终必需
    DATABASE_URL: z.string().min(1, 'DATABASE_URL 是必需的'),
    
    // Redis - 始终必需
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string().optional(),
    
    // S3 - 生产环境必需，开发环境可选
    S3_ENDPOINT: isProduction 
        ? z.string().url('S3_ENDPOINT 必须是有效的 URL')
        : z.string().optional(),
    S3_REGION: isProduction
        ? z.string().min(1)
        : z.string().default('us-east-1'),
    S3_ACCESS_KEY_ID: isProduction
        ? z.string().min(1, 'S3_ACCESS_KEY_ID 在生产环境是必需的')
        : z.string().optional(),
    S3_SECRET_ACCESS_KEY: isProduction
        ? z.string().min(1, 'S3_SECRET_ACCESS_KEY 在生产环境是必需的')
        : z.string().optional(),
    S3_BUCKET: isProduction
        ? z.string().min(1, 'S3_BUCKET 在生产环境是必需的')
        : z.string().optional(),
    
    // AI Providers - 至少配置一个图片生成服务
    ALIYUN_IMAGE_API_KEY: z.string().optional(),
    SILICONFLOW_API_KEY: z.string().optional(),
    
    // 3D 模型生成 - 生产环境必需
    TENCENTCLOUD_SECRET_ID: isProduction
        ? z.string().min(1, 'TENCENTCLOUD_SECRET_ID 在生产环境是必需的')
        : z.string().optional(),
    TENCENTCLOUD_SECRET_KEY: isProduction
        ? z.string().min(1, 'TENCENTCLOUD_SECRET_KEY 在生产环境是必需的')
        : z.string().optional(),
    
    // 公开 URL - 生产环境必需
    PUBLIC_URL: isProduction
        ? z.string().url('PUBLIC_URL 必须是有效的 URL')
        : z.string().default('http://localhost:3000'),
    
    // 用户服务 - 始终必需
    USER_SERVICE_URL: z.string().url('USER_SERVICE_URL 必须是有效的 URL'),
});

// 自定义验证：至少配置一个图片生成服务
const parsedEnv = envSchema.parse(process.env);

if (!parsedEnv.ALIYUN_IMAGE_API_KEY && !parsedEnv.SILICONFLOW_API_KEY) {
    throw new Error(
        '至少需要配置一个图片生成服务：ALIYUN_IMAGE_API_KEY 或 SILICONFLOW_API_KEY'
    );
}
```

**2. 添加配置完整性测试**

在 `src/config/health-check.ts` (新建文件):
```typescript
import { logger } from '@/utils/logger';
import { config } from './index';
import { redisClient } from '@/utils/redis-client';
import { db } from '@/db/drizzle';
import { UserServiceClient } from '@/clients/user-service.client';

export interface HealthCheckResult {
    service: string;
    status: 'healthy' | 'unhealthy';
    message?: string;
}

export async function checkAllServices(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    
    // 1. 检查数据库连接
    try {
        await db.execute('SELECT 1');
        results.push({ service: 'database', status: 'healthy' });
    } catch (error) {
        results.push({
            service: 'database',
            status: 'unhealthy',
            message: error.message
        });
    }
    
    // 2. 检查 Redis 连接
    try {
        await redisClient.ping();
        results.push({ service: 'redis', status: 'healthy' });
    } catch (error) {
        results.push({
            service: 'redis',
            status: 'unhealthy',
            message: error.message
        });
    }
    
    // 3. 检查用户服务
    try {
        const userService = new UserServiceClient();
        // 尝试一个简单的请求
        await userService.verifyToken('test-token').catch(() => {
            // 预期会失败，但能连接就算健康
        });
        results.push({ service: 'user-service', status: 'healthy' });
    } catch (error) {
        results.push({
            service: 'user-service',
            status: 'unhealthy',
            message: error.message
        });
    }
    
    // 4. 检查 S3 配置（生产环境）
    if (config.nodeEnv === 'production') {
        try {
            const { storageService } = await import('@/services/storage.service');
            // 尝试列出桶（不需要真的有文件）
            await storageService.listAllFiles().catch(() => {
                // 即使列表为空或失败，至少配置是有效的
            });
            results.push({ service: 's3', status: 'healthy' });
        } catch (error) {
            results.push({
                service: 's3',
                status: 'unhealthy',
                message: error.message
            });
        }
    }
    
    return results;
}

export async function runStartupHealthCheck(): Promise<void> {
    logger.info('开始启动健康检查...');
    
    const results = await checkAllServices();
    const unhealthy = results.filter(r => r.status === 'unhealthy');
    
    if (unhealthy.length > 0) {
        logger.error({
            unhealthy,
            all: results
        }, '部分服务不健康');
        
        // 生产环境下，如果核心服务不健康，拒绝启动
        if (config.nodeEnv === 'production') {
            const criticalServices = ['database', 'redis', 'user-service'];
            const criticalUnhealthy = unhealthy.filter(r =>
                criticalServices.includes(r.service)
            );
            
            if (criticalUnhealthy.length > 0) {
                throw new Error(
                    `关键服务不健康，拒绝启动：${criticalUnhealthy.map(r => r.service).join(', ')}`
                );
            }
        }
    } else {
        logger.info({ results }, '所有服务健康');
    }
}
```

**3. 在启动脚本中调用健康检查**

在 `src/server.ts` 中:
```typescript
import { runStartupHealthCheck } from '@/config/health-check';

async function start() {
    try {
        // 加载配置（会自动验证）
        const { config } = await import('@/config');
        logger.info({ config: { nodeEnv: config.nodeEnv, port: config.server.port } }, '配置加载成功');
        
        // 运行健康检查
        await runStartupHealthCheck();
        
        // 构建应用
        const app = await buildApp();
        
        // 启动服务器
        await app.listen({
            port: config.server.port,
            host: config.server.host,
        });
        
        logger.info(`🚀 Server is running on http://${config.server.host}:${config.server.port}`);
    } catch (error) {
        logger.error({ error }, '服务器启动失败');
        process.exit(1);
    }
}
```

**4. 添加健康检查端点**

在 `src/routes/health.route.ts` 中增强:
```typescript
import { checkAllServices } from '@/config/health-check';

app.get('/api/health/detailed', {
    schema: {
        tags: ['Health'],
        summary: '详细健康检查',
        response: {
            200: {
                type: 'object',
                properties: {
                    status: { type: 'string' },
                    data: {
                        type: 'object',
                        properties: {
                            services: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        service: { type: 'string' },
                                        status: { type: 'string' },
                                        message: { type: 'string' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}, async (request, reply) => {
    const results = await checkAllServices();
    const allHealthy = results.every(r => r.status === 'healthy');
    
    return reply
        .status(allHealthy ? 200 : 503)
        .jsendSuccess({ services: results });
});
```

#### 验证步骤

1. 移除某个必需的环境变量，尝试启动服务
2. 确认启动失败并显示清晰的错误信息
3. 访问 `/api/health/detailed` 查看详细健康状态
4. 在生产模式下测试所有验证规则

---

## 📊 修复优先级和时间表

### 第 1 周（本周）

**必须完成** - 安全和稳定性关键问题：
- ✅ **问题 1**: 认证系统漏洞修复
- ✅ **问题 2**: Redis 资源管理优化

**预计工作量**: 8-12 小时

### 第 2-3 周

**高优先级** - 用户体验和数据一致性：
- 🔄 **问题 3**: Worker 错误处理完善
- 🔄 **问题 4**: 数据库事务补充
- 🔄 **问题 5**: 配置验证增强

**预计工作量**: 16-20 小时

---

## 🧪 测试计划

### 单元测试

为修复的代码编写单元测试：
- 认证中间件测试（伪造 header 应失败）
- Redis 重试逻辑测试（50 次后停止）
- 事务回滚测试（中间失败全部回滚）
- 配置验证测试（缺少必需配置应抛错）

### 集成测试

端到端测试关键流程：
- 完整的任务生成流程（图片 → 模型）
- 任务失败重试和死信队列
- 服务启动健康检查
- S3 文件清理

### 性能测试

确认修复不影响性能：
- Worker 处理吞吐量
- Redis 连接池压力测试
- 数据库事务并发测试

---

## 📝 其他建议

虽然不在前 5 个紧急问题中，但仍需关注：

### 中优先级（1-2 个月内）

6. **外部服务调用超时和重试** - 为所有 Provider 添加统一的超时控制和重试策略
7. **日志脱敏** - 避免记录敏感信息（完整 prompt、token 等）
8. **错误堆栈追踪** - 实现错误 ID 关联日志和响应

### 低优先级（3 个月+）

9. **并发控制优化** - 用户级别的任务限流，防止滥用
10. **监控和告警** - 集成 APM 工具（如 Sentry、DataDog）
11. **API 限流** - 防止 DDoS 和暴力请求

---

## 🔗 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 系统架构设计
- [AUTHENTICATION.md](./AUTHENTICATION.md) - 认证系统详解
- [COMPLETE_WORKFLOW.md](./COMPLETE_WORKFLOW.md) - 完整工作流程

---

## 📅 更新日志

| 日期 | 问题编号 | 状态 | 备注 |
|------|---------|------|------|
| 2025-12-18 | - | 创建 | 初始文档创建 |

---

**注意**: 本文档会随着修复进度持续更新。每个问题修复完成后，请更新状态并记录实际修复方案。
