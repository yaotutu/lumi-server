# 日志输出优化说明

## 🎯 优化内容

已完成日志输出格式优化，解决日志占用过多垂直空间的问题。

### 修改文件

1. **新建**: `src/config/logger.config.ts` - 统一的日志配置
2. **修改**: `src/utils/logger.ts` - 应用单行配置
3. **修改**: `src/app.ts` - 应用单行配置

---

## 📊 效果对比

### 优化前（占据 15+ 行）
```json
{
  "id": "zb21j0bnb492os5yico6o3ify",
  "requestId": "j52nocm29035nlwal271vmch",
  "index": 1,
  "imageUrl": "http://192.168.88.100:3000/api/proxy/image?url=https%3A%2F%2Fai3d-1375240212.cos.ap-guangzhou.myqcloud.com%2Fimages%2Fj52nocm29035nlwal271vmch%2F1.png",
  "imagePrompt": "Q版卡通兵马俑，圆润造型，短手短腿，盈甜纹理简化成几何线条...",
  "imageStatus": "COMPLETED",
  "createdAt": "2025-12-15T05:45:39.000Z",
  "completedAt": "2025-12-15T05:46:04.000Z",
  "failedAt": null,
  "errorMessage": null,
  "generationJob": {
    "id": "bjfyznaa5911ogjfrda5f09q",
    "status": "COMPLETED",
    "retryCount": 0
  }
}
```

### 优化后（只占 1 行）
```
[15:46:04] INFO: {"id":"zb21j0bnb492os5yico6o3ify","requestId":"j52nocm29035nlwal271vmch","index":1,"imageUrl":"http://192.168.88.100:3000/api/proxy/image?url=https%3A%2F%2Fai3d-1375240212.cos.ap-guangzhou.myqcloud.com%2Fimages%2Fj52nocm29035nlwal271vmch%2F1.png","imagePrompt":"Q版卡通兵马俑，圆润造型，短手短腿，盈甜纹理简化成几何线条...","imageStatus":"COMPLETED","createdAt":"2025-12-15T05:45:39.000Z","completedAt":"2025-12-15T05:46:04.000Z","failedAt":null,"errorMessage":null,"generationJob":{"id":"bjfyznaa5911ogjfrda5f09q","status":"COMPLETED","retryCount":0}}
```

**压缩率**: 减少 **90%+** 的垂直空间占用

---

## 💡 使用说明

### 正常开发（查看关键信息）
```bash
npm run dev
# 或
npm run dev:workers
```

日志会以单行显示，关键信息一目了然。

### 需要查看完整内容时

**方法 1: 终端横向滚动**
- 使用终端的水平滚动条查看长内容
- 或使用 `Shift + 方向键` 横向滚动

**方法 2: 开启 Debug 级别**
```bash
LOG_LEVEL=debug npm run dev
```

这会显示更详细的调试信息（如果代码中有用 `logger.debug()` 记录）。

**方法 3: 将日志输出到文件**
```bash
npm run dev 2>&1 | tee logs/dev.log
```

然后用编辑器打开 `logs/dev.log` 查看完整内容。

---

## 🔧 配置说明

### `src/config/logger.config.ts`

```typescript
export const pinoPrettyOptions = {
  singleLine: true,              // ✅ 单行显示
  colorize: true,                // 彩色输出
  translateTime: 'HH:MM:ss',     // 简化时间格式
  ignore: 'pid,hostname',        // 隐藏不必要字段
};
```

**为什么不截断内容？**
- 保留完整信息，需要时可以查看
- 通过终端横向滚动即可查看详细内容
- 避免信息丢失

---

## 📝 最佳实践建议

### 1. 区分日志级别

在代码中区分使用不同的日志级别：

```typescript
// ✅ info: 记录关键业务信息（简洁）
logger.info({
  msg: '✅ 图片生成完成',
  imageId,
  status: 'completed',
  duration: 1234
});

// ✅ debug: 记录详细调试信息（完整对象）
logger.debug({
  msg: '图片详细信息',
  fullImageObject
});
```

### 2. 避免记录过大的对象

```typescript
// ❌ 不好：记录整个请求对象
logger.info({ request });

// ✅ 更好：只记录关键字段
logger.info({
  requestId: request.id,
  status: request.status
});
```

### 3. 使用结构化日志

```typescript
// ✅ 推荐：结构化字段
logger.info({
  msg: '任务完成',
  taskId,
  duration,
  status
});

// ❌ 不推荐：纯文本
logger.info('任务 ' + taskId + ' 完成，耗时 ' + duration);
```

---

## 🚀 后续优化（可选）

如果仍觉得日志过多，可以考虑：

1. **禁用部分路由的日志**:
   ```typescript
   app.get('/health', { logLevel: 'warn' }, async () => ({ status: 'ok' }));
   ```

2. **完全禁用请求日志**:
   ```typescript
   // src/app.ts
   disableRequestLogging: true,
   ```

3. **按环境变量控制**:
   ```typescript
   disableRequestLogging: process.env.DISABLE_REQUEST_LOGGING === 'true',
   ```

---

## ✅ 验证

启动服务后，观察日志输出：
- 应该是单行格式
- 颜色高亮显示
- 时间格式为 `HH:MM:ss`

**测试命令**:
```bash
npm run dev
```

如有问题，请检查 `.env` 文件中是否设置了 `NODE_ENV=development`。

---

**优化日期**: 2025-12-15
**相关文件**:
- `src/config/logger.config.ts`
- `src/utils/logger.ts`
- `src/app.ts`
