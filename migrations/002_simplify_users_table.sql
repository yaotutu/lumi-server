-- Migration: 简化 users 表为极简映射表
-- 日期: 2025-01-16
-- 说明: 删除用户信息缓存字段，完全依赖外部用户服务

-- 删除冗余字段
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users DROP COLUMN user_name;
ALTER TABLE users DROP COLUMN nick_name;
ALTER TABLE users DROP COLUMN avatar;
ALTER TABLE users DROP COLUMN gender;
ALTER TABLE users DROP COLUMN last_sync_at;
ALTER TABLE users DROP COLUMN last_login_at;
ALTER TABLE users DROP COLUMN name;

-- 说明：
-- users 表现在只保留：
--   - id (本地主键)
--   - external_user_id (外部用户ID映射)
--   - created_at
--   - updated_at
