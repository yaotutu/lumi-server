# 用户表迁移总结

## 迁移日期
2025-12-17

## 迁移目标
将 lumi-server 从维护本地用户表改造为完全依赖外部用户服务（user.ai3d.top），实现服务端用户表的精简。

## 主要变更

### 1. 数据库 Schema 变更
- ✅ 删除 `users` 表
- ✅ 4个表的 `user_id` 列重命名为 `external_user_id`：
  - `models`
  - `generation_requests`
  - `model_interactions`
  - `email_verification_codes`
- ✅ 更新相关索引名称：
  - `user_id_created_at_idx` → `external_user_id_created_at_idx`
  - `user_id_model_id_type_unique` → `external_user_id_model_id_type_unique`
  - `user_id_type_created_at_idx` → `external_user_id_type_created_at_idx`

### 2. 代码层变更

#### Schema 层（Drizzle ORM）
- `src/db/schema/models.ts` - 字段和关系更新
- `src/db/schema/generation-requests.ts` - 字段和索引更新
- `src/db/schema/model-interactions.ts` - 字段、约束和索引更新
- `src/db/schema/email-verification-codes.ts` - 字段更新
- `src/db/schema/users.ts` - 已删除
- `src/db/schema/index.ts` - 移除 users 导出

#### Repository 层
- `src/repositories/model.repository.ts` - 移除 users JOIN，更新方法签名
- `src/repositories/generation-request.repository.ts` - 更新字段引用
- `src/repositories/interaction.repository.ts` - 更新方法参数
- `src/repositories/user.repository.ts` - 已删除
- `src/repositories/index.ts` - 移除 userRepository 导出

#### Service 层
- `src/services/model.service.ts` - 权限检查使用 externalUserId
- `src/services/generation-request.service.ts` - 更新事务中的字段
- `src/services/interaction.service.ts` - 更新 create 调用
- `src/services/auth.service.ts` - 完全重写，仅保留验证码功能

#### Middleware & Workers
- `src/middleware/auth.middleware.ts` - 移除本地用户创建逻辑
- `src/queues/model-queue.ts` - ModelJobData 接口更新
- `src/workers/model.worker.ts` - 使用 externalUserId

### 3. 配置文件变更
- `drizzle.config.ts` - schema 路径改为 dist 编译产物

## 迁移执行

### SQL 迁移脚本
```sql
-- 重命名列
ALTER TABLE `models` CHANGE COLUMN `user_id` `external_user_id` varchar(36) NOT NULL;
ALTER TABLE `generation_requests` CHANGE COLUMN `user_id` `external_user_id` varchar(36) NOT NULL;
ALTER TABLE `model_interactions` CHANGE COLUMN `user_id` `external_user_id` varchar(36) NOT NULL;
ALTER TABLE `email_verification_codes` CHANGE COLUMN `user_id` `external_user_id` varchar(36);

-- 重命名索引
ALTER TABLE `models` DROP INDEX `user_id_created_at_idx`;
ALTER TABLE `models` ADD INDEX `external_user_id_created_at_idx` (`external_user_id`, `created_at`);

ALTER TABLE `generation_requests` DROP INDEX `user_id_created_at_idx`;
ALTER TABLE `generation_requests` ADD INDEX `external_user_id_created_at_idx` (`external_user_id`, `created_at`);

ALTER TABLE `model_interactions` DROP INDEX `user_id_model_id_type_unique`;
ALTER TABLE `model_interactions` ADD UNIQUE INDEX `external_user_id_model_id_type_unique` (`external_user_id`, `model_id`, `interaction_type`);

ALTER TABLE `model_interactions` DROP INDEX `user_id_type_created_at_idx`;
ALTER TABLE `model_interactions` ADD INDEX `external_user_id_type_created_at_idx` (`external_user_id`, `interaction_type`, `created_at`);

-- 删除 users 表
DROP TABLE IF EXISTS `users`;
```

### 执行命令
```bash
mysql -h 192.168.110.220 -u db_user_mysql -pdb_password_mysql -D tope_mysql_db < /tmp/migration.sql
```

## 验证结果

### 数据库验证
- ✅ `users` 表已删除
- ✅ 剩余 7 个表结构正确
- ✅ 所有 `external_user_id` 列创建成功
- ✅ 所有索引重命名成功
- ✅ 数据完整性：6 个模型记录保留，无数据丢失

### 代码验证
- ✅ TypeScript 编译通过（0 错误）
- ✅ 所有导入路径正确
- ✅ 所有类型定义匹配

## 后续注意事项

1. **认证流程**：所有用户信息现在完全依赖外部服务 `user.ai3d.top`
2. **用户ID**：系统中所有 `externalUserId` 字段存储的是外部服务返回的 `user_id`
3. **权限验证**：所有权限检查基于 `externalUserId` 进行
4. **用户信息获取**：需要通过 Bearer Token 调用外部服务获取用户详细信息

## 已删除的功能
- 本地用户注册
- 本地用户密码管理
- 本地用户信息存储
- externalUserId 与本地 userId 的映射

## 保留的功能
- ✅ 邮箱验证码发送
- ✅ 验证码验证
- ✅ 基于外部用户 ID 的模型管理
- ✅ 基于外部用户 ID 的权限控制
- ✅ 基于外部用户 ID 的交互记录
