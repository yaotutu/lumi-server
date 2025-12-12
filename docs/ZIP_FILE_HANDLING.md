# ZIP 文件处理文档

## 问题背景

腾讯云混元 3D API 返回的 3D 模型文件是以 **ZIP 压缩包** 的形式存储的,URL 通常以 `_0.zip` 结尾。

前端 GLTFLoader 无法直接解析 ZIP 文件,会报错:
```
Unexpected token 'P', "PK   "... is not valid JSON
```

其中 `PK` 是 ZIP 文件的魔术字节(Magic Bytes)。

## 解决方案

在 `/api/proxy/model` 代理路由中添加 **ZIP 文件自动解压逻辑**:

### 1. 检测 ZIP 文件

```typescript
// 方法 1: 根据文件扩展名判断
const extension = modelUrl.split('.').pop()?.toLowerCase() || '';
const isZipByExtension = extension === 'zip';

// 方法 2: 根据文件头魔术字节判断
const isZipByMagicBytes = buffer.toString('utf8', 0, 2) === 'PK';

// 综合判断
const isZipFile = isZipByExtension || isZipByMagicBytes;
```

### 2. 解压 ZIP 文件

使用 `adm-zip` 库解压 ZIP 文件:

```typescript
import AdmZip from 'adm-zip';

const zip = new AdmZip(buffer);
const zipEntries = zip.getEntries();
```

### 3. 查找模型文件

在 ZIP 压缩包中查找模型文件(OBJ, GLB, GLTF):

```typescript
const modelEntry = zipEntries.find((entry) => {
  const entryExt = entry.entryName.split('.').pop()?.toLowerCase();
  return entryExt === 'obj' || entryExt === 'glb' || entryExt === 'gltf';
});
```

### 4. 提取模型文件

```typescript
buffer = zip.readFile(modelEntry);
extension = modelEntry.entryName.split('.').pop()?.toLowerCase() || '';
```

### 5. 返回模型文件

提取后的 `buffer` 包含实际的模型文件内容,根据文件扩展名设置正确的 `Content-Type` 并返回给前端。

## 实现细节

### 修改文件

- **`src/routes/proxy.route.ts`**: 添加 ZIP 解压逻辑

### 依赖库

```json
{
  "dependencies": {
    "adm-zip": "^0.5.16"
  },
  "devDependencies": {
    "@types/adm-zip": "^0.5.5"
  }
}
```

### 完整流程

```
1. 前端请求: GET /api/proxy/model?url=https://xxx.tencentcos.cn/xxx_0.zip
              ↓
2. 后端下载: fetch(url) → ZIP 文件 Buffer
              ↓
3. 检测 ZIP: extension === 'zip' || buffer[0:2] === 'PK'
              ↓
4. 解压 ZIP: new AdmZip(buffer)
              ↓
5. 查找模型: zipEntries.find(e => e.ext in ['obj', 'glb', 'gltf'])
              ↓
6. 提取文件: zip.readFile(modelEntry)
              ↓
7. 返回模型: reply.send(buffer) with Content-Type: text/plain (OBJ)
              ↓
8. 前端加载: GLTFLoader 成功解析 OBJ 文件
```

## 支持的格式

| 格式 | Content-Type | 说明 |
|------|-------------|------|
| OBJ  | text/plain | 3D 几何体文件(文本格式) |
| MTL  | text/plain | 材质定义文件(文本格式) |
| GLB  | model/gltf-binary | glTF 二进制格式 |
| GLTF | model/gltf+json | glTF JSON 格式 |
| FBX  | application/octet-stream | Autodesk FBX 格式 |
| PNG/JPG | image/png, image/jpeg | 纹理图片 |

## 日志输出

```log
检测到 ZIP 文件，开始解压 url=https://xxx.tencentcos.cn/xxx_0.zip
ZIP 文件内容 entries=["model.obj", "model.mtl", "texture.png"]
✅ 从 ZIP 中提取模型文件 fileName=model.obj size=1234567 bytes
OBJ 文件头 fileHeader="# Blender v2.93.0 OBJ File..."
OBJ 文件大小 size=1234567 bytes
```

## 错误处理

### ZIP 文件中未找到模型文件

```json
{
  "error": "No model file found in ZIP archive"
}
```

返回状态码: `400 Bad Request`

### ZIP 解压失败

```json
{
  "error": "Failed to extract ZIP file"
}
```

返回状态码: `500 Internal Server Error`

## 测试建议

### 1. 测试 ZIP 文件解压

```bash
curl -I "http://localhost:3000/api/proxy/model?url=https://xxx.tencentcos.cn/xxx_0.zip"
```

预期:
- 状态码: `200 OK`
- `Content-Type: text/plain` (OBJ) 或 `model/gltf-binary` (GLB)

### 2. 测试非 ZIP 文件

```bash
curl -I "http://localhost:3000/api/proxy/model?url=https://xxx.myqcloud.com/model.glb"
```

预期:
- 状态码: `200 OK`
- `Content-Type: model/gltf-binary`
- 不触发 ZIP 解压逻辑

### 3. 前端测试

在前端创建新任务,等待 3D 模型生成完成后,检查模型是否能正常加载:

```typescript
const loader = new GLTFLoader();
loader.load(
  `/api/proxy/model?url=${modelUrl}`,
  (gltf) => {
    console.log('✅ 模型加载成功', gltf);
  },
  undefined,
  (error) => {
    console.error('❌ 模型加载失败', error);
  }
);
```

## 参考资料

- [ZIP 文件格式](https://en.wikipedia.org/wiki/ZIP_(file_format))
- [adm-zip NPM Package](https://www.npmjs.com/package/adm-zip)
- [glTF Loader - Three.js](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [腾讯云混元 3D API](https://cloud.tencent.com/document/product/1729)
