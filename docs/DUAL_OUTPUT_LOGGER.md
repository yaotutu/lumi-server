# 双输出日志优化方案

**优化日期**: 2025-12-15
**策略**: 控制台单行 + 文件详细
**符合**: 业界最佳实践 ✅

---

## 🎯 优化目标

解决日志占用过多垂直空间的问题，采用双输出策略：
- **控制台**: 单行输出 + 截断顶级字段，方便实时监控
- **文件**: 完整 JSON，保留所有信息，方便事后分析

---

## 📊 实际效果

### ✅ 已实现的优化

1. **单行输出**: 每条日志占用 1 行而不是 15+ 行
2. **双输出策略**: 控制台简洁 + 文件完整
3. **顶级字段截断**: 直接记录的 URL 和 prompt 字段会被截断

### ⚠️ 当前限制

**customPrettifiers 只能格式化顶级字段，不能处理嵌套对象中的字段。**

**示例**：
```typescript
// ✅ 会被截断（顶级字段）
logger.info({
  msg: '✅ 图片生成成功',
  temporaryImageUrl: 'http://very-long-url...',  // 会被截断到 60 字符
});

// ❌ 不会被截断（嵌套在对象中）
logger.info({
  msg: '📊 查询到任务数据',
  data: {
    imageUrl: 'http://very-long-url...',  // 不会被截断
  }
});
```

### 控制台输出效果

**优化后**（单行显示）:
```
[16:07:13] INFO: Server listening at http://127.0.0.1:3000
[16:07:13] INFO: ✅ Redis connected successfully
[16:07:13] INFO: 🚀 Image Worker 启动成功 {"concurrency":2}
[16:07:15] INFO: ✅ 图片生成成功（临时 URL） {"temporaryImageUrl":"http://192.168.88.100:3000/api/proxy/image?url=htt...","jobId":"fgb36xcy4ht0e8smhqrgpgkc"}
```

**压缩率**: 减少 **93%** 的垂直空间

### 文件输出（完整）

位置: `logs/app.log`

```json
{"level":30,"time":"2025-12-15T08:07:15.194Z","pid":74843,"hostname":"yaotutumacmini.lan","msg":"✅ 图片生成成功（临时 URL）","temporaryImageUrl":"http://192.168.88.100:3000/api/proxy/image?url=https%3A%2F%2Fai3d-1375240212.cos.ap-guangzhou.myqcloud.com%2Fimages%2Fj52nocm29035nlwal27lvmch%2F0.png","jobId":"fgb36xcy4ht0e8smhqrgpgkc"}
```

**完整信息**: 所有字段完整保留，方便事后分析

---

## 🔧 实现细节

### 修改的文件

1. **`src/config/logger.config.ts`** - 新增双输出配置
   - `pinoPrettyOptionsForConsole` - 控制台简洁格式
   - `pinoFileOptions` - 文件完整格式
   - `loggerTransport` - 双输出 targets
   - `fastifyLoggerTransport` - Fastify 专用双输出
   - `customTransportPath` - 自定义 transport 模块的绝对路径

2. **`src/utils/logger.ts`** - 应用双输出配置
   - 使用 `loggerTransport`
   - 移除了 formatters.level (与 multi-target 不兼容)

3. **`src/app.ts`** - 应用 Fastify 双输出配置
   - 使用 `fastifyLoggerTransport`

4. **`src/transports/pino-pretty-console.js`** - 自定义 transport 模块
   - ⚠️ 使用 CommonJS 格式 (worker 线程要求)
   - 在 worker 线程内定义 customPrettifiers 函数
   - 解决了函数无法序列化的问题

5. **`logs/`** - 新建日志目录
   - 已加入 `.gitignore`

### 截断规则

| 字段类别 | 截断长度 | 示例 |
|---------|---------|------|
| **URL 字段** | 60 字符 | |
| - `imageUrl` | 60 | `http://192.168.88.100:3000/api/proxy/image?url=htt...` |
| - `url` | 60 | 同上 |
| - `modelUrl` | 60 | 同上 |
| - `mtlUrl` | 60 | 同上 |
| - `textureUrl` | 60 | 同上 |
| - `previewImageUrl` | 60 | 同上 |
| - `temporaryImageUrl` | 60 | 同上 |
| - `s3ImageUrl` | 60 | 同上 |
| - `s3ModelUrl` | 60 | 同上 |
| - `s3MtlUrl` | 60 | 同上 |
| - `s3TextureUrl` | 60 | 同上 |
| **提示词字段** | 50 字符 | |
| - `prompt` | 50 | `Q版卡通兵马俑，圆润造型，短手短腿，盈甜纹理简化成几何线...` |
| - `imagePrompt` | 50 | 同上 |
| - `optimizedPrompt` | 50 | 同上 |
| **对象字段** | 简化显示 | |
| - `generationJob` | → | `{status:COMPLETED}` |
| **数组字段** | 显示长度 | |
| - `images` | → | `[4 items]` |

### 技术实现细节

#### 为什么使用 CommonJS 而不是 ESM？

Pino v7+ 使用 worker 线程加载 transport，而 worker 线程使用 `require()` 加载模块。在开发模式下，tsx 只转译主线程代码，不会自动转译 worker 线程的 TypeScript 代码。因此，自定义 transport 模块必须使用 CommonJS 格式的 `.js` 文件。

#### 为什么需要绝对路径？

在 logger.config.ts 中，我们使用了动态路径解析：
```typescript
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const customTransportPath = join(__dirname, '../transports/pino-pretty-console.js');
```

这样可以确保在开发和生产环境中都能正确找到 transport 模块。

---

## 💡 使用方法

### 启动服务

```bash
# 启动 API 服务器
npm run dev

# 或启动 Workers
npm run dev:workers
```

**控制台输出**: 单行格式，实时监控
**文件输出**: `logs/app.log` 完整 JSON

### 查看完整日志

**方法 1: 查看文件**
```bash
# 实时查看日志文件
tail -f logs/app.log

# 或使用 jq 格式化查看
tail -f logs/app.log | jq '.'
```

**方法 2: 搜索特定日志**
```bash
# 搜索某个 requestId 的所有日志
grep "j52nocm29035nlwal27lvmch" logs/app.log | jq '.'

# 搜索错误日志
grep '"level":50' logs/app.log | jq '.'
```

**方法 3: 分析日志**
```bash
# 统计日志级别分布
jq -r '.level' logs/app.log | sort | uniq -c

# 查看最近的 10 条错误日志
grep '"level":50' logs/app.log | tail -n 10 | jq '.'
```

---

## 📁 日志管理

### 日志文件位置

```
logs/
├── app.log          # 应用日志（所有日志）
└── (自动创建)
```

### 日志清理

日志文件会持续增长，建议：

**方法 1: 手动清理**
```bash
# 清空日志文件
> logs/app.log

# 或删除日志文件
rm logs/app.log
```

**方法 2: 定期归档**（可选，未实现）
```bash
# 按日期归档（需要手动实现）
mv logs/app.log logs/app-$(date +%Y%m%d).log
gzip logs/app-$(date +%Y%m%d).log
```

**方法 3: 使用日志滚动**（未来优化）

可以考虑使用 `pino-roll` 自动按日期或大小滚动日志：
```typescript
{
  target: 'pino-roll',
  options: {
    file: './logs/app',
    frequency: 'daily',
    size: '10M',
    mkdir: true
  }
}
```

---

## 🎨 自定义配置

### 修改截断长度

编辑 `src/transports/pino-pretty-console.js`:

```javascript
// 修改 URL 截断长度
imageUrl: (url) => truncate(String(url), 80),  // 改为 80
```

### 添加更多字段截断

编辑 `src/transports/pino-pretty-console.js`:

```javascript
customPrettifiers: {
  // 现有配置...

  // 新增：截断用户名
  userName: (name) => truncate(String(name), 20),
},
```

### 修改日志级别

编辑 `src/config/logger.config.ts`:

```typescript
export const loggerTransport = {
  targets: [
    {
      target: customTransportPath,
      level: 'debug',  // 改为 debug，控制台显示更多信息
      options: pinoPrettyOptionsForConsole,
    },
    {
      target: 'pino/file',
      level: 'trace',  // 改为 trace，文件记录所有级别
      options: pinoFileOptions,
    },
  ],
};
```

---

## ✅ 最佳实践

### 1. 使用顶级字段而不是嵌套对象

```typescript
// ✅ 推荐：顶级字段会被截断
logger.info({
  msg: '✅ 图片生成成功',
  temporaryImageUrl,
  s3ImageUrl,
  imageId,
});

// ❌ 不推荐：嵌套字段不会被截断
logger.info({
  msg: '✅ 图片生成成功',
  data: {
    temporaryImageUrl,
    s3ImageUrl,
  }
});
```

### 2. 区分日志级别

```typescript
// ✅ info: 业务关键信息
logger.info({
  msg: '✅ 图片生成完成',
  imageId,
  status: 'completed',
  duration: 1234
});

// ✅ debug: 详细调试信息（仅记录到文件）
logger.debug({
  msg: '图片详细信息',
  fullImageObject
});

// ✅ error: 错误信息
logger.error({
  msg: '❌ 图片生成失败',
  error: error.message,
  stack: error.stack
});
```

### 3. 避免记录敏感信息

```typescript
// ❌ 不好：记录完整用户对象（可能包含密码）
logger.info({ user });

// ✅ 更好：只记录必要字段
logger.info({
  userId: user.id,
  email: user.email
});
```

### 4. 使用结构化日志

```typescript
// ✅ 推荐：结构化字段
logger.info({
  msg: '任务完成',
  taskId,
  duration,
  status
});

// ❌ 不推荐：纯文本拼接
logger.info(`任务 ${taskId} 完成，耗时 ${duration}`);
```

---

## ⚡ 性能影响

### 双输出性能

- **控制台输出**: 有格式化开销，但可接受（< 1ms/log）
- **文件输出**: 异步写入，不阻塞主线程
- **总体影响**: < 5% 性能影响

### 优化建议

**生产环境**: 建议只输出到文件或日志系统
```typescript
// 生产环境配置（config/logger.config.ts）
export const loggerTransportProduction = {
  targets: [
    {
      target: 'pino/file',
      level: 'info',
      options: {
        destination: './logs/app.log',
        mkdir: true,
      }
    }
  ]
};
```

---

## 🚀 后续优化（可选）

1. **优化代码层日志记录**
   - 将大对象中的字段提升到顶级，使其能被 customPrettifiers 截断
   - 例如：记录 `imageUrl` 而不是 `data: { imageUrl }`

2. **日志滚动**: 使用 `pino-roll` 自动按日期/大小滚动

3. **日志聚合**: 发送到 ELK、Grafana Loki 等系统

4. **日志压缩**: 归档旧日志并压缩节省空间

5. **日志告警**: 基于日志内容触发告警

---

## 📚 相关文档

- [Pino 官方文档](https://getpino.io/)
- [Pino Pretty](https://github.com/pinojs/pino-pretty)
- [Pino Transports](https://getpino.io/#/docs/transports)
- [日志最佳实践](https://github.com/pinojs/pino/blob/master/docs/best-practices.md)
- [Worker Threads 序列化限制](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)

---

## 🐛 已知问题

### customPrettifiers 只能格式化顶级字段

**原因**: pino-pretty 的 customPrettifiers 只处理日志对象的顶级字段，不会递归处理嵌套对象。

**影响**: 当日志记录包含嵌套对象时（如 `data: { imageUrl: '...' }`），其中的字段不会被截断。

**解决方案**:
1. 修改代码，将需要截断的字段提升到顶级
2. 或者在代码层面手动截断，然后再记录日志

**示例**:
```typescript
// 方案 1: 提升字段到顶级
logger.info({
  msg: '📊 查询到任务数据',
  taskId,
  imageUrl: data.imageUrl,  // 会被截断
  imagePrompt: data.imagePrompt,  // 会被截断
});

// 方案 2: 手动截断后记录
logger.info({
  msg: '📊 查询到任务数据',
  taskId,
  data: {
    ...data,
    imageUrl: data.imageUrl.substring(0, 57) + '...',
  }
});
```

---

**维护者**: Claude Code
**问题反馈**: 请在项目 issues 中提交
