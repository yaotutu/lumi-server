# Lumi Server

基于 Fastify、Drizzle ORM、Redis、BullMQ 和 S3 的高性能后端服务。

## 技术栈

- **框架**: Fastify 5.x
- **数据库**: MySQL + Drizzle ORM
- **缓存/队列**: Redis + BullMQ（外部服务）
- **存储**: S3 兼容存储
- **日志**: Pino
- **验证**: Zod
- **代码规范**: Biome.js

## 项目结构

```
src/
├── config/              # 配置管理
├── db/                  # 数据库相关
│   ├── schema/          # Drizzle Schema
│   └── migrations/      # 数据库迁移
├── queues/              # BullMQ 队列定义
├── workers/             # 队列 Worker（待实现）
├── services/            # 业务逻辑层
├── repositories/        # 数据访问层（待实现）
├── providers/           # 外部服务适配器（待实现）
├── routes/              # Fastify 路由
├── plugins/             # Fastify 插件
├── middleware/          # 中间件
├── utils/               # 工具函数
└── types/               # TypeScript 类型
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

```bash
npm run dev
```

服务器将在 `http://localhost:3000` 启动。

## 可用命令

```bash
npm run dev          # 启动开发服务器（热重载）
npm run build        # 构建生产版本
npm start            # 启动生产服务器
npm run lint         # 检查代码规范
npm run lint:fix     # 自动修复代码规范
npm run format       # 格式化代码
npm run check        # 运行所有检查（lint + 类型检查）
npm run db:generate  # 生成数据库迁移
npm run db:migrate   # 执行数据库迁移
npm run db:push      # 推送 schema 到数据库
npm run db:studio    # 打开 Drizzle Studio
```

## API 端点

### 健康检查

- `GET /api/health` - 基础健康检查
- `GET /api/health/detailed` - 详细健康检查（包含数据库和 Redis 状态）

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

## 后续计划

- [ ] 实现业务逻辑迁移（从 Next.js 项目）
- [ ] 实现 Provider 适配器
- [ ] 实现 Worker 逻辑
- [ ] 实现 Repository 层
- [ ] 添加单元测试
- [ ] 添加 API 文档（Swagger）

## License

MIT
