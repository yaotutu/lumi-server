# Lumi Server 完整实现计划

## 当前状态
基础架构已完成,但 API 路径和功能与 Next.js 不匹配

## 实现计划

### Phase 1: API 路径重构 (1h)
1. 重命名路由文件
   - requests.route.ts → tasks.route.ts
   - models.route.ts → gallery-models.route.ts
2. 修改所有路径
   - /api/requests → /api/tasks
   - /api/models → /api/gallery/models

### Phase 2: 认证系统 (4h)
1. 创建认证中间件 auth.middleware.ts
2. 创建认证路由 auth.route.ts
   - POST /api/auth/send-code
   - POST /api/auth/verify-code  
   - POST /api/auth/logout
   - GET /api/auth/me
3. 创建认证 Service
4. 邮件发送集成

### Phase 3: 任务更新 API (2h)
1. 在 tasks.route.ts 添加 PATCH /api/tasks/:id
2. 实现选择图片触发3D生成逻辑

### Phase 4: 数据库字段补充 (1h)
1. models 表添加 sliceTaskId, printStatus 字段
2. 执行迁移

### Phase 5: 打印功能 (4h)
1. POST /api/tasks/:id/print
2. GET /api/tasks/:id/print-status

### Phase 6: 批量查询 (1h)
1. POST /api/gallery/models/batch-interactions

总计: 约13小时
