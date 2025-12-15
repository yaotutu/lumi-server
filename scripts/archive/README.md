# 脚本归档

本目录存放项目开发过程中使用的临时脚本，包括测试脚本、检查脚本、数据迁移脚本等。这些脚本主要用于开发和调试阶段，已归档保存以备将来参考。

## 📂 目录结构

```
archive/
├── testing/      # 测试脚本
├── checking/     # 检查脚本
└── migration/    # 迁移和更新脚本
```

---

## 🧪 测试脚本 (testing/)

### test-api-response.ts
**用途**: 测试 API 响应格式（JSend 规范验证）
**使用方法**:
```bash
npx tsx scripts/archive/testing/test-api-response.ts
```

### test-apis.sh
**用途**: 集成测试脚本，测试所有 API 端点
**使用方法**:
```bash
bash scripts/archive/testing/test-apis.sh
```

### test-image-proxy.ts
**用途**: 测试图片代理功能和 CORS 配置
**使用方法**:
```bash
API_BASE_URL=http://localhost:3000 npx tsx scripts/archive/testing/test-image-proxy.ts
```

### test-model-download.ts
**用途**: 测试 3D 模型下载功能
**使用方法**:
```bash
npx tsx scripts/archive/testing/test-model-download.ts
```

---

## 🔍 检查脚本 (checking/)

### check-latest-images.ts
**用途**: 查看最新生成的图片记录
**使用方法**:
```bash
npx tsx scripts/archive/checking/check-latest-images.ts
```

### check-latest-model.ts
**用途**: 查看最新生成的 3D 模型详情
**使用方法**:
```bash
npx tsx scripts/archive/checking/check-latest-model.ts
```

### check-latest-models.ts
**用途**: 查看最近生成的多个 3D 模型
**使用方法**:
```bash
npx tsx scripts/archive/checking/check-latest-models.ts
```

### check-model-details.ts
**用途**: 查看指定模型的详细信息
**使用方法**:
```bash
npx tsx scripts/archive/checking/check-model-details.ts
```

### check-model-urls.ts
**用途**: 检查 3D 模型的 URL 字段（modelUrl、mtlUrl 等）
**使用方法**:
```bash
npx tsx scripts/archive/checking/check-model-urls.ts
```

### check-orphaned-models.ts
**用途**: 检查孤立的 3D 模型（无关联请求）
**使用方法**:
```bash
npx tsx scripts/archive/checking/check-orphaned-models.ts
```

### check-specific-model.ts
**用途**: 检查特定 ID 的模型信息
**使用方法**:
```bash
npx tsx scripts/archive/checking/check-specific-model.ts <model-id>
```

### check-task.ts
**用途**: 检查生成任务的详细状态
**使用方法**:
```bash
npx tsx scripts/archive/checking/check-task.ts <task-id>
```

---

## 🔄 迁移和更新脚本 (migration/)

### add-model-url-fields.ts
**用途**: 为模型表添加 URL 字段（一次性迁移）
**说明**: 数据库 schema 迁移脚本，已完成执行

### update-all-private-models.ts
**用途**: 批量更新所有私有模型的可见性
**使用方法**:
```bash
npx tsx scripts/archive/migration/update-all-private-models.ts
```

### update-latest-model.ts
**用途**: 更新最新模型的状态或属性
**使用方法**:
```bash
npx tsx scripts/archive/migration/update-latest-model.ts
```

### update-latest-private-model.ts
**用途**: 更新最新私有模型的可见性
**使用方法**:
```bash
npx tsx scripts/archive/migration/update-latest-private-model.ts
```

### update-models-to-public.ts
**用途**: 批量将模型设置为公开
**使用方法**:
```bash
npx tsx scripts/archive/migration/update-models-to-public.ts
```

### confirm-migration.js
**用途**: 确认 Next.js 到 Fastify 的迁移完成
**说明**: 迁移验证脚本，已完成使命

---

## ⚠️ 使用注意事项

1. **归档脚本不建议日常使用**
   - 这些脚本主要用于开发和调试阶段
   - 部分脚本可能依赖特定的数据库状态

2. **数据安全**
   - 更新和迁移脚本会修改数据库
   - 使用前请确保有数据库备份
   - 建议先在开发环境测试

3. **环境变量**
   - 所有脚本需要正确配置 `.env` 文件
   - 确保 `DATABASE_URL` 等必要变量已设置

4. **TypeScript 执行**
   - 使用 `npx tsx` 运行 TypeScript 脚本
   - 或先编译：`npm run build`

---

## 📌 相关资源

- **实用脚本**: 查看 `scripts/maintenance/` 和 `scripts/deployment/`
- **主文档**: 查看项目根目录的 `README.md`
- **数据库迁移**: 使用 `npm run db:*` 命令

---

**归档日期**: 2025-12-15
**归档原因**: 项目结构优化，脚本分类管理
