# OBJ 模型 MTL 文件未传递到前端的问题修复

## 问题描述

用户报告：**目前生成的 OBJ 模型都有 MTL 材质文件，但前端没有收到 mtlUrl 数据。**

## 问题调查

### 1. 数据库检查

运行 `scripts/check-model-urls.ts` 脚本查询数据库：

```
📊 统计结果:
  有 modelUrl:   5/5
  有 mtlUrl:     0/5     ❌ 所有 MTL URL 都是 NULL
  有 textureUrl: 0/5     ❌ 所有纹理 URL 都是 NULL

⚠️  警告: 所有 OBJ 模型都没有 mtlUrl 数据！
```

**结论**：数据库中所有 OBJ 模型的 `mtlUrl` 和 `textureUrl` 字段都是 NULL，说明 Worker 没有正确保存这些数据。

### 2. 模型文件结构分析

下载测试实际的模型文件：

```bash
# OBJ 文件 (3.1 MB)
curl https://ai3d-1375240212.cos.ap-guangzhou.myqcloud.com/models/s9m4qhdb9k3qoezmto9xolys/model.obj

# 文件头部内容：
mtllib material.mtl  ← 引用了 MTL 文件
o material
v -0.051780 -0.466295 -0.370794
...
```

**结论**：OBJ 文件不是 ZIP 压缩包，而是普通的 OBJ 文本文件，第一行引用了 `material.mtl`。

### 3. MTL 和纹理文件存在性验证

手动测试发现腾讯云在同一目录下存储了所有文件：

```bash
# MTL 文件存在 (80 bytes)
curl -I ".../material.mtl"  → HTTP 200 OK

# MTL 文件内容：
newmtl Material
Kd 0.800 0.800 0.800
Ni 1.500
d 1.0
illum 1
map_Kd material.png  ← 引用了纹理文件

# 纹理文件存在 (12.5 MB)
curl -I ".../material.png"  → HTTP 200 OK
```

**结论**：腾讯云的文件结构如下：
- `/models/{id}/model.obj` - OBJ 文件（腾讯云 API 只返回这个 URL）
- `/models/{id}/material.mtl` - MTL 材质文件（需要推导）
- `/models/{id}/material.png` - 纹理图片（需要推导）

### 4. 代码问题定位

原代码逻辑 (`src/utils/model-storage.ts:67-97`)：

```typescript
// 2. 检查是否是 ZIP 文件
const isZip = modelBuffer[0] === 0x50 && modelBuffer[1] === 0x4b;

if (format === 'obj' && isZip) {
  // 只有 ZIP 才会处理 MTL 和纹理
  return await handleObjZipArchive(modelId, modelBuffer);
}

// 3. 非 ZIP 文件，直接上传
return {
  objUrl: storageUrl,
  mtlUrl: null,  // ❌ 这里返回 null！
  textureUrl: null,
};
```

**根本原因**：当 OBJ 文件不是 ZIP 时，代码直接返回了 `mtlUrl: null` 和 `textureUrl: null`，没有尝试下载同目录的 MTL 和纹理文件。

## 解决方案

### 修改文件

**`src/utils/model-storage.ts`**

### 1. 新增处理函数

添加了 `handleObjSeparateFiles` 函数来处理非 ZIP 的 OBJ 文件：

```typescript
async function handleObjSeparateFiles(
  objRemoteUrl: string,
  modelId: string,
  objBuffer: Buffer,
): Promise<{ objUrl: string; mtlUrl: string | null; textureUrl: string | null }> {
  // 1. 上传 OBJ 文件
  const objUrl = await storageService.uploadModel(modelId, 'model.obj', objBuffer);

  // 2. 推导 MTL 和纹理文件的 URL
  const baseUrl = objRemoteUrl.replace('/model.obj', '');
  const mtlRemoteUrl = `${baseUrl}/material.mtl`;
  const texturePngUrl = `${baseUrl}/material.png`;
  const textureJpgUrl = `${baseUrl}/material.jpg`;

  // 3. 尝试下载 MTL 文件
  let mtlUrl: string | null = null;
  try {
    const mtlResponse = await fetch(mtlRemoteUrl);
    if (mtlResponse.ok) {
      const mtlBuffer = Buffer.from(await mtlResponse.arrayBuffer());
      mtlUrl = await storageService.uploadModel(modelId, 'material.mtl', mtlBuffer);
    }
  } catch (error) {
    logger.warn('MTL 文件下载失败，继续处理');
  }

  // 4. 尝试下载纹理文件（PNG 或 JPG）
  let textureUrl: string | null = null;
  for (const { url, filename } of [
    { url: texturePngUrl, filename: 'material.png' },
    { url: textureJpgUrl, filename: 'material.jpg' },
  ]) {
    if (textureUrl) break;
    try {
      const textureResponse = await fetch(url);
      if (textureResponse.ok) {
        const textureBuffer = Buffer.from(await textureResponse.arrayBuffer());
        textureUrl = await storageService.uploadModel(modelId, filename, textureBuffer);
      }
    } catch (error) {
      logger.warn(`纹理文件下载失败: ${filename}`);
    }
  }

  return { objUrl, mtlUrl, textureUrl };
}
```

### 2. 修改主逻辑

更新 `downloadAndUploadModel` 函数：

```typescript
// 2. 检查是否是 ZIP 文件
const isZip = modelBuffer[0] === 0x50 && modelBuffer[1] === 0x4b;

if (format === 'obj' && isZip) {
  // OBJ 格式 + ZIP 压缩包：解压并处理
  return await handleObjZipArchive(modelId, modelBuffer);
}

if (format === 'obj' && !isZip) {
  // ✅ OBJ 格式 + 非 ZIP：腾讯云在同目录下存储了 MTL 和纹理文件
  return await handleObjSeparateFiles(remoteUrl, modelId, modelBuffer);
}

// 3. 其他格式（GLB 等），直接上传
const storageUrl = await storageService.uploadModel(modelId, `model.${format}`, modelBuffer);
return { objUrl: storageUrl, mtlUrl: null, textureUrl: null };
```

## 效果验证

### 下次生成新模型时，Worker 日志应显示：

```
📁 检测到非 ZIP 的 OBJ 文件，尝试下载同目录的 MTL 和纹理文件
⬇️ 尝试下载 MTL 文件
✅ MTL 文件下载成功 (80 bytes)
✅ MTL 文件上传成功
⬇️ 尝试下载纹理文件: material.png
✅ 纹理文件下载成功: material.png (12.5 MB)
✅ 纹理文件上传成功
🎉 非 ZIP OBJ 文件处理完成
```

### 数据库应包含：

```sql
SELECT id, modelUrl, mtlUrl, textureUrl FROM models WHERE format = 'OBJ' ORDER BY created_at DESC LIMIT 1;

-- 预期结果：
-- modelUrl:   https://s3.../model.obj     ✅
-- mtlUrl:     https://s3.../material.mtl  ✅
-- textureUrl: https://s3.../material.png  ✅
```

### 前端应收到完整数据：

```json
{
  "model": {
    "id": "...",
    "modelUrl": "http://192.168.88.100:3000/api/proxy/model?url=...",
    "mtlUrl": "http://192.168.88.100:3000/api/proxy/model?url=...",
    "textureUrl": "http://192.168.88.100:3000/api/proxy/model?url=...",
    "format": "OBJ"
  }
}
```

### Three.js 应正确加载模型：

```javascript
// Model3DViewer 组件会根据 format 和 mtlUrl 选择正确的加载器
if (normalizedFormat === "OBJ") {
  if (mtlUrl) {
    return <OBJModelWithMTL objUrl={modelUrl} mtlUrl={mtlUrl} />;  // ✅ 使用 MTLLoader
  }
  return <OBJModelWithoutMTL objUrl={modelUrl} />;
}
```

## 影响范围

- **旧数据兼容性**：✅ 完全兼容
  - 旧模型的 `mtlUrl` 和 `textureUrl` 为 NULL，前端已处理此情况
  - 前端会使用默认材质渲染旧模型

- **新数据**：✅ 将包含完整的 MTL 和纹理 URL
  - 新生成的模型会自动下载并保存 MTL 和纹理文件
  - 前端将正确加载并显示材质和纹理

## 相关文件

- `src/utils/model-storage.ts` - 模型存储逻辑（已修改）
- `src/workers/model.worker.ts` - Worker 调用模型存储（无需修改）
- `src/repositories/generation-request.repository.ts` - 已支持 mtlUrl 和 textureUrl 字段（无需修改）
- `src/repositories/model.repository.ts` - 已支持 mtlUrl 和 textureUrl 字段（无需修改）
- Frontend: `Model3DViewer.tsx` - 已支持 mtlUrl 和 format 参数（无需修改）

## 测试建议

1. 生成一个新的 3D 模型
2. 检查 Worker 日志，确认 MTL 和纹理文件下载成功
3. 检查数据库，确认 `mtlUrl` 和 `textureUrl` 不为 NULL
4. 检查前端，确认模型正确显示材质和纹理
5. 使用浏览器开发者工具，确认没有 CORS 错误

## 注意事项

- **容错处理**：如果 MTL 或纹理文件不存在（HTTP 404），不会导致整个流程失败，只是对应字段为 NULL
- **文件命名**：腾讯云使用固定的文件名 `material.mtl` 和 `material.png`/`material.jpg`
- **代理 URL**：所有 URL 都会通过 Repository 层转换为代理 URL，前端直接使用

## 修复日期

2025-12-12

## 修复人员

Claude (AI Assistant)
