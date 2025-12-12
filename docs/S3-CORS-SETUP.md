# 腾讯云 COS（S3）CORS 配置指南

## 为什么需要配置 CORS？

当前系统中，图片和模型文件存储在腾讯云 COS（对象存储），前端需要直接访问这些资源。为了避免浏览器的跨域限制，需要在 COS 上配置 CORS（跨源资源共享）规则。

## 配置步骤

### 1. 登录腾讯云控制台

访问：https://console.cloud.tencent.com/cos

### 2. 进入存储桶设置

1. 找到并点击存储桶：`ai3d-1375240212`
2. 进入「安全管理」→「跨域访问 CORS 设置」
3. 点击「添加规则」

### 3. 添加 CORS 规则

填入以下配置：

| 配置项 | 值 |
|--------|-----|
| **来源 Origin** | `*` （允许所有来源，生产环境建议限制为具体域名） |
| **操作 Methods** | 勾选 `GET` 和 `HEAD` |
| **Allow-Headers** | `*` |
| **Expose-Headers** | `ETag, Content-Type, Content-Length, Last-Modified` |
| **超时 Max-Age** | `3600`（1小时） |

### 4. 保存配置

点击「提交」保存 CORS 规则。

## CORS 规则详解

```json
{
  "AllowedOrigins": ["*"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": [
    "ETag",
    "Content-Type",
    "Content-Length",
    "Last-Modified"
  ],
  "MaxAgeSeconds": 3600
}
```

### 配置说明

- **AllowedOrigins**: 允许哪些来源访问（`*` 表示所有来源）
  - 生产环境建议改为：`["http://localhost:4100", "http://192.168.88.100:4100"]` 等具体前端域名
- **AllowedMethods**: 允许的HTTP方法（GET用于读取文件，HEAD用于检查文件是否存在）
- **AllowedHeaders**: 允许的请求头（`*` 表示所有请求头）
- **ExposeHeaders**: 暴露给前端的响应头
- **MaxAgeSeconds**: 预检请求（OPTIONS）的缓存时间（秒）

## 验证配置

配置完成后，可以通过浏览器控制台检查图片加载：

1. 打开前端页面
2. 按 F12 打开开发者工具 → Network 标签
3. 刷新页面，查看图片请求
4. 检查响应头中是否包含：
   ```
   Access-Control-Allow-Origin: *
   ```

如果看到这个响应头，说明 CORS 配置成功！

## 生产环境安全建议

在生产环境中，建议：

1. **限制来源域名**：不要使用 `*`，而是指定具体的前端域名
   ```json
   "AllowedOrigins": [
     "https://your-production-domain.com",
     "https://www.your-production-domain.com"
   ]
   ```

2. **启用HTTPS**：确保所有访问都通过 HTTPS

3. **设置存储桶访问权限**：
   - 对象权限：公有读、私有写
   - 防盗链：配置 Referer 白名单

## 常见问题

### Q: 配置后仍然报CORS错误？

A: 可能原因：
1. 浏览器缓存了旧的CORS配置，尝试清除缓存或使用无痕模式
2. 配置未生效，等待1-2分钟后重试
3. 检查来源 Origin 是否匹配（区分大小写）

### Q: 是否需要在后端也配置CORS？

A: 需要。后端API（Fastify）也需要配置CORS，但这是两个不同的配置：
- **后端 CORS**：允许前端调用 API 接口（已在 `src/app.ts` 中配置）
- **COS CORS**：允许前端直接加载 S3 中的图片和模型文件（需在腾讯云控制台配置）

## 相关文件

- 前端图片URL处理：`/Users/yaotutu/Desktop/code/lumi-web-next/lib/utils/proxy-url.ts`
- 后端S3服务：`/Users/yaotutu/Desktop/code/lumi-server/src/services/storage.service.ts`
- 后端CORS配置：`/Users/yaotutu/Desktop/code/lumi-server/src/app.ts` (第50-54行)
