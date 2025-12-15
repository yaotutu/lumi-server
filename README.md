# Lumi Server

基于 Fastify、Drizzle ORM、Redis、BullMQ 和 S3 的高性能 AI 图像和 3D 模型生成后端服务。

> ✨ **迁移完成**: 本项目已从 Next.js 后端完全迁移到独立的 Fastify 服务器
>
> 详细迁移文档请查看 [MIGRATION_SUMMARY.md](./MIGRATION_SUMMARY.md)

## 技术栈

- **框架**: Fastify 5.x (高性能 Web 框架)
- **数据库**: MySQL + Drizzle ORM 0.38 (类型安全)
- **缓存/队列**: Redis + BullMQ 5.x
- **AI 服务**: 阿里云/腾讯云/SiliconFlow
- **存储**: AWS S3 兼容存储
- **日志**: Pino (结构化日志)
- **验证**: Zod (类型安全验证)
- **代码规范**: Biome.js

## 项目结构

```
src/
├── config/              # 配置管理 (Zod 验证)
├── db/                  # 数据库
│   ├── schema/          # Drizzle Schema 定义 (8 个表)
│   └── migrations/      # 数据库迁移文件
├── repositories/        # 数据访问层 (6 个 Repository)
├── providers/           # 外部服务适配器
│   ├── image/           # 图片生成 (Aliyun, SiliconFlow)
│   ├── model3d/         # 3D 模型生成 (Tencent Cloud)
│   ├── llm/             # LLM 服务 (Qwen, SiliconFlow)
│   └── storage/         # S3 对象存储
├── services/            # 业务逻辑层 (4 个 Service)
├── workers/             # 任务处理 (2 个 Workers)
├── queues/              # BullMQ 队列定义
├── routes/              # Fastify 路由 (4 个模块)
├── prompts/             # LLM 提示词定义
├── middleware/          # Fastify 中间件
├── utils/               # 工具函数 (logger, redis, response, errors)
├── app.ts               # Fastify 应用构建
└── server.ts            # 应用入口
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写必要的配置：

```bash
cp .env.example .env
```

**重要配置项**：
- `DATABASE_URL`: 外部 MySQL 数据库连接字符串（格式：`mysql://user:password@host:3306/database`）
- `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`: 外部 Redis 服务配置
- `S3_*`: S3 存储配置

### 3. 运行数据库迁移

```bash
npm run db:generate  # 生成迁移文件
npm run db:push      # 推送到数据库
```

### 4. 启动开发服务器

**推荐方式（一个命令启动所有服务）：**

```bash
npm run dev
```

这个命令会同时启动两个进程：
- **API Server**（端口 3000）- 处理 HTTP 请求
- **Worker Server** - 处理图片和 3D 模型生成任务

两个进程的输出都会显示在同一个终端，带有不同颜色标记：
- `[API]` - 青色，API 服务器的日志
- `[Worker]` - 品红色，Worker 的日志

**单独启动（可选）：**

```bash
# 终端 1: 只启动 API 服务器
npm run dev:api

# 终端 2: 只启动 Worker 服务器
npm run dev:workers
```

服务器将在 `http://localhost:3000` 启动。

## 可用命令

```bash
# 开发环境
npm run dev          # 启动开发服务器（API + Worker，一个终端）
npm run dev:api      # 仅启动 API 服务器（热重载）
npm run dev:workers  # 仅启动 Worker 服务器（热重载）

# 生产环境
npm run build        # 构建生产版本
npm start            # 启动生产 API 服务器
npm run start:workers # 启动生产 Worker 服务器

# 代码质量
npm run lint         # 检查代码规范
npm run lint:fix     # 自动修复代码规范
npm run format       # 格式化代码
npm run check        # 运行所有检查（lint + 类型检查）

# 数据库
npm run db:generate  # 生成数据库迁移
npm run db:migrate   # 执行数据库迁移
npm run db:push      # 推送 schema 到数据库
npm run db:studio    # 打开 Drizzle Studio

# 测试
npm test             # 运行测试
npm run test:watch   # 监听模式运行测试
npm run test:ui      # 打开测试 UI
```

## API 端点

### 健康检查
- `GET /health` - 基础健康检查
- `GET /health/detailed` - 详细健康检查 (MySQL + Redis)
- `GET /` - API 信息

### 生成请求
- `GET /api/requests` - 获取请求列表
- `GET /api/requests/:id` - 获取请求详情
- `POST /api/requests` - 创建生成请求 (支持提示词优化)
- `DELETE /api/requests/:id` - 删除请求

### 模型管理
- `GET /api/models/me` - 用户模型列表
- `GET /api/models/public` - 公开模型列表 (支持排序)
- `GET /api/models/:id` - 模型详情
- `POST /api/models` - 创建 3D 模型
- `PATCH /api/models/:id` - 更新模型
- `POST /api/models/:id/publish` - 发布模型
- `POST /api/models/:id/unpublish` - 取消发布
- `DELETE /api/models/:id` - 删除模型
- `POST /api/models/:id/download` - 下载计数

### 交互
- `POST /api/models/:id/like` - 点赞/取消点赞
- `POST /api/models/:id/favorite` - 收藏/取消收藏
- `GET /api/models/:id/interaction-status` - 交互状态
- `GET /api/me/liked-models` - 点赞列表
- `GET /api/me/favorited-models` - 收藏列表

详细 API 文档请查看 [MIGRATION_SUMMARY.md](./MIGRATION_SUMMARY.md)

## 响应格式

使用 JSend 规范：

```typescript
// 成功响应
{
  "status": "success",
  "data": { ... }
}

// 失败响应（客户端错误）
{
  "status": "fail",
  "data": {
    "message": "错误信息",
    "code": "ERROR_CODE",
    "details": { ... }
  }
}

// 错误响应（服务端错误）
{
  "status": "error",
  "message": "错误信息",
  "code": "ERROR_CODE"
}
```

## 环境变量

查看 `.env.example` 了解所有可用的环境变量配置。

## 开发规范

- 使用 Biome.js 进行代码格式化和检查
- 使用 TypeScript 严格模式
- 遵循 JSend 响应格式规范
- 使用 Pino 记录日志
- 使用 Zod 进行数据验证

## 功能特性

- ✅ 完整的后端架构 (7 层)
- ✅ 类型安全 (100% TypeScript)
- ✅ 高性能 (Fastify + Drizzle + BullMQ)
- ✅ 异步任务处理 (图片/模型生成)
- ✅ AI 服务集成 (阿里云/腾讯云/SiliconFlow)
- ✅ S3 对象存储
- ✅ 结构化日志 (Pino)
- ✅ 健康检查 (MySQL + Redis)
- ✅ JSend 响应规范
- ✅ 完整错误处理

## 待实现功能

### 高优先级
- [ ] 用户认证中间件 (JWT)
- [ ] 文件上传和下载
- [ ] 权限验证增强

### 中优先级
- [ ] 请求参数验证 (Zod)
- [ ] API 文档 (Swagger/OpenAPI)
- [ ] 分页统一处理

### 低优先级
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能监控

## License

MIT
