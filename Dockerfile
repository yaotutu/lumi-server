# ============================================
# 阶段 1: 依赖安装和构建阶段
# ============================================
FROM node:22-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json（如果存在）
# 利用 Docker 缓存层，只有在依赖变化时才重新安装
COPY package*.json ./

# 安装所有依赖（包括 devDependencies，因为需要 TypeScript 编译）
RUN npm ci

# 复制源代码
COPY . .

# 构建 TypeScript 代码
RUN npm run build

# ============================================
# 阶段 2: 生产运行阶段
# ============================================
FROM node:22-alpine AS production

# 设置工作目录
WORKDIR /app

# 安装 dumb-init（用于正确处理信号）
RUN apk add --no-cache dumb-init

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 只安装生产依赖
RUN npm ci --omit=dev && \
    npm cache clean --force

# 从构建阶段复制编译后的代码
COPY --from=builder /app/dist ./dist

# 复制数据库迁移文件（SQL 文件不会被 TypeScript 编译，需要单独复制）
COPY --from=builder /app/src/db/migrations ./src/db/migrations

# 复制必要的配置文件（如果有）
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# 设置文件所有权
RUN chown -R nodejs:nodejs /app

# 切换到非 root 用户
USER nodejs

# 暴露端口（API 服务器）
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production

# 健康检查（检查 API 服务器是否正常）
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 使用 dumb-init 作为 PID 1，正确处理信号
ENTRYPOINT ["dumb-init", "--"]

# 默认同时启动 API 和 Worker 服务器
# 可以通过 docker run 时覆盖命令来单独启动某个服务：
#   - API only: docker run ... node dist/server.js
#   - Worker only: docker run ... node dist/workers/start-workers.js
CMD ["node", "dist/start-all.js"]
