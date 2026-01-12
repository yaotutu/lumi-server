# Docker 部署指南

本文档说明如何使用 Docker 构建、部署和运行 Lumi Server 项目。

---

## 📋 目录

- [快速开始](#快速开始)
- [本地构建](#本地构建)
- [使用 Docker Hub 镜像](#使用-docker-hub-镜像)
- [GitHub Actions 自动构建](#github-actions-自动构建)
- [环境变量配置](#环境变量配置)
- [常见问题](#常见问题)

---

## 🚀 快速开始

### 使用 Docker Compose（推荐）

1. **准备环境变量文件**

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
vim .env
```

2. **启动所有服务**

```bash
# 使用 Docker Hub 镜像启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

3. **访问服务**

- API 服务器: http://localhost:3000
- API 文档: http://localhost:3000/docs
- 健康检查: http://localhost:3000/api/health

---

## 🏗️ 本地构建

### 1. 构建镜像

```bash
# 构建镜像
docker build -t lumi-server:local .

# 多架构构建（需要 buildx）
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t lumi-server:local \
  --load \
  .
```

### 2. 运行容器

**默认启动（同时运行 API 和 Worker）：**

```bash
docker run -d \
  --name lumi-server \
  -p 3000:3000 \
  --env-file .env \
  lumi-server:local
```

**可选：单独启动某个服务**

如果需要分别部署 API 和 Worker：

```bash
# 只启动 API 服务器
docker run -d \
  --name lumi-api \
  -p 3000:3000 \
  --env-file .env \
  lumi-server:local \
  node dist/server.js

# 只启动 Worker 服务器
docker run -d \
  --name lumi-worker \
  --env-file .env \
  lumi-server:local \
  node dist/workers/start-workers.js
```

### 3. 查看日志

```bash
# 查看 Lumi Server 日志（包含 API 和 Worker）
docker logs -f lumi-server

# 如果分别运行
docker logs -f lumi-api
docker logs -f lumi-worker
```

---

## 🐳 使用 Docker Hub 镜像

### 镜像标签说明

| 标签 | 说明 | 分支/触发器 |
|------|------|------------|
| `yaotutu/lumi-server:latest` | 最新生产版本 | `main` 分支 |
| `yaotutu/lumi-server:v1.0.0` | 特定版本号 | Git Tag (v1.0.0) |
| `yaotutu/lumi-server:dev` | 最新开发版本 | `dev` 分支 |
| `yaotutu/lumi-server:dev-latest` | 开发版最新 | `dev` 分支 |
| `yaotutu/lumi-server:dev-abc1234` | 特定 commit | `dev` 分支 + commit SHA |

### 拉取镜像

```bash
# 拉取最新生产版本
docker pull yaotutu/lumi-server:latest

# 拉取最新开发版本
docker pull yaotutu/lumi-server:dev-latest

# 拉取特定版本
docker pull yaotutu/lumi-server:v1.0.0
```

### 使用预构建镜像

**使用 Docker Compose（推荐）：**

修改 `docker-compose.yml` 中的镜像标签：

```yaml
services:
  lumi-server:
    image: yaotutu/lumi-server:latest  # 改为你需要的标签
    # ...
```

**使用 Docker Run：**

```bash
# 拉取并运行最新版本（同时启动 API 和 Worker）
docker run -d \
  --name lumi-server \
  -p 3000:3000 \
  --env-file .env \
  yaotutu/lumi-server:latest
```

---

## ⚙️ GitHub Actions 自动构建

### 配置 Secrets

在 GitHub 仓库设置中添加以下 Secrets：

1. 进入 **Settings** → **Secrets and variables** → **Actions**
2. 添加以下 secrets：

| Secret 名称 | 说明 | 必需 |
|------------|------|------|
| `DOCKERHUB_USERNAME` | Docker Hub 用户名 | ✅ |
| `DOCKERHUB_TOKEN` | Docker Hub 访问令牌 | ✅ |
| `BARK_KEY` | Bark 通知密钥（可选） | ❌ |

**获取 Docker Hub Token：**
1. 登录 [Docker Hub](https://hub.docker.com/)
2. 进入 **Account Settings** → **Security** → **New Access Token**
3. 创建 Token 并复制

### 工作流说明

#### 1. 开发版本构建 (`.github/workflows/docker-publish-dev.yml`)

- **触发条件**: 推送到 `dev` 分支
- **生成标签**:
  - `yaotutu/lumi-server:dev`
  - `yaotutu/lumi-server:dev-latest`
  - `yaotutu/lumi-server:dev-{commit-sha}`

**手动触发：**
```bash
# 在 GitHub Actions 页面点击 "Run workflow"
# 或使用 gh CLI
gh workflow run docker-publish-dev.yml
```

#### 2. 生产版本构建 (`.github/workflows/docker-publish-prod.yml`)

- **触发条件**:
  - 推送到 `main` 分支
  - 创建 Git Tag (例如 `v1.0.0`)
- **生成标签**:
  - `yaotutu/lumi-server:latest`
  - `yaotutu/lumi-server:v1.0.0`（如果是 tag）
  - `yaotutu/lumi-server:1.0`（主版本号）
  - `yaotutu/lumi-server:1`（大版本号）

**创建发布版本：**

```bash
# 创建 tag
git tag -a v1.0.0 -m "Release version 1.0.0"

# 推送 tag（会自动触发构建）
git push origin v1.0.0
```

### 查看构建状态

- 进入 GitHub 仓库的 **Actions** 页面
- 查看工作流运行状态和日志

---

## 🔧 环境变量配置

### 必需的环境变量

```bash
# 数据库
DATABASE_URL=mysql://user:password@host:3306/database

# Redis（根据环境选择）
REDIS_HOST=localhost                # 本地: localhost, 服务器: clustercfg.xxx
REDIS_PORT=6379
REDIS_PASSWORD=                     # 可选
REDIS_DB=0                          # 单节点模式
REDIS_TLS=false                     # AWS MemoryDB 设置为 true
REDIS_CLUSTER_MODE=false            # AWS MemoryDB 设置为 true

# S3
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-secret
S3_BUCKET=your-bucket

# AI Providers
ALIYUN_IMAGE_API_KEY=xxx
TENCENTCLOUD_SECRET_ID=xxx
TENCENTCLOUD_SECRET_KEY=xxx
SILICONFLOW_API_KEY=xxx

# CORS
FRONTEND_URLS=http://localhost:4100

# 用户服务
USER_SERVICE_URL=http://user.ai3d.top
```

完整配置请参考 `.env.example` 或 [ENVIRONMENT.md](./ENVIRONMENT.md)。

---

## 🛠️ 常见问题

### 1. 容器是如何同时运行 API 和 Worker 的？

容器内使用了一个启动脚本 `start-all.js`，它会同时启动两个 Node.js 进程：
- API 服务器（监听 3000 端口）
- Worker 服务器（处理队列任务）

这类似于开发环境的 `npm run dev` 命令（使用 concurrently）。

### 2. 如何只运行 API 或只运行 Worker？

可以通过覆盖容器启动命令来实现：

```bash
# 只运行 API
docker run -d \
  --name lumi-api \
  -p 3000:3000 \
  --env-file .env \
  yaotutu/lumi-server:latest \
  node dist/server.js

# 只运行 Worker
docker run -d \
  --name lumi-worker \
  --env-file .env \
  yaotutu/lumi-server:latest \
  node dist/workers/start-workers.js
```

### 3. 如何查看容器日志？

```bash
# 实时查看日志（会看到 API 和 Worker 的输出）
docker logs -f lumi-server

# 查看最近 100 行日志
docker logs --tail 100 lumi-server

# 日志会自动标记 [API] 和 [Worker]，方便区分
```

### 4. 如何进入容器调试？

```bash
# 进入运行中的容器
docker exec -it lumi-server sh

# 查看环境变量
docker exec lumi-server env

# 查看进程（会看到两个 node 进程）
docker exec lumi-server ps aux
```

### 5. 如何更新镜像？

```bash
# 拉取最新镜像
docker pull yaotutu/lumi-server:latest

# 重启容器
docker-compose down
docker-compose up -d
```

### 6. 健康检查失败怎么办？

```bash
# 检查健康状态
docker ps

# 查看详细健康检查日志
docker inspect --format='{{json .State.Health}}' lumi-server | jq

# 手动测试健康检查
docker exec lumi-server curl http://localhost:3000/api/health
```

### 7. Redis 连接失败？

**本地开发：**
- 确保 `REDIS_HOST=redis`（Docker Compose 网络内）
- 确保 `REDIS_TLS=false`
- 确保 `REDIS_CLUSTER_MODE=false`

**服务器部署：**
- 检查 Redis 服务器是否可访问
- 如果使用 AWS MemoryDB，设置 `REDIS_TLS=true` 和 `REDIS_CLUSTER_MODE=true`

### 8. 如何自定义 Docker 镜像？

修改 `Dockerfile` 后重新构建：

```bash
# 本地构建
docker build -t my-lumi-server:custom .

# 推送到 Docker Hub
docker tag my-lumi-server:custom username/lumi-server:custom
docker push username/lumi-server:custom
```

### 9. 如何启用数据库迁移？

在容器启动前运行迁移：

```bash
# 方式 1: 使用临时容器
docker run --rm --env-file .env yaotutu/lumi-server:latest npm run db:migrate

# 方式 2: 在运行中的容器执行
docker exec lumi-server npm run db:migrate
```

### 10. 如何在生产环境分别部署 API 和 Worker？

如果需要横向扩展，可以分别部署：

```bash
# 部署多个 API 实例（负载均衡）
docker run -d --name lumi-api-1 -p 3001:3000 --env-file .env yaotutu/lumi-server:latest node dist/server.js
docker run -d --name lumi-api-2 -p 3002:3000 --env-file .env yaotutu/lumi-server:latest node dist/server.js

# 部署多个 Worker 实例（并发处理）
docker run -d --name lumi-worker-1 --env-file .env yaotutu/lumi-server:latest node dist/workers/start-workers.js
docker run -d --name lumi-worker-2 --env-file .env yaotutu/lumi-server:latest node dist/workers/start-workers.js
```

---

## 📚 相关文档

- [环境配置详解](./ENVIRONMENT.md)
- [后端开发指南](./CLAUDE.md)
- [系统架构设计](./docs/ARCHITECTURE.md)
- [Docker 官方文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)

---

## 🆘 获取帮助

遇到问题？

1. 查看日志: `docker logs -f lumi-api`
2. 检查健康状态: `docker ps`
3. 查看详细配置: `docker inspect lumi-api`
4. 参考本文档的 [常见问题](#常见问题) 章节
5. 查看 GitHub Issues

---

## 📝 许可证

MIT License
