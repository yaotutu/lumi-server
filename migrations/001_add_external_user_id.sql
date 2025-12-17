-- Migration: 添加外部用户ID支持
-- 日期: 2025-01-16
-- 说明: 将用户表改造为缓存表，支持外部用户服务对接

-- 1. 添加新字段
ALTER TABLE users
  ADD COLUMN external_user_id VARCHAR(36),
  ADD COLUMN user_name VARCHAR(255),
  ADD COLUMN nick_name VARCHAR(255),
  ADD COLUMN gender VARCHAR(20),
  ADD COLUMN last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 2. 为 external_user_id 添加唯一索引
-- 注意：先要确保字段中没有重复值
ALTER TABLE users
  ADD UNIQUE INDEX external_user_id_unique (external_user_id);

-- 3. 如果旧的 name 字段还在使用，可以将数据迁移到 user_name
-- UPDATE users SET user_name = name WHERE user_name IS NULL AND name IS NOT NULL;

-- 4. 可选：如果要删除旧的 name 字段（谨慎操作）
-- ALTER TABLE users DROP COLUMN name;

-- 5. 为现有用户生成临时的 external_user_id（如果有旧数据）
-- 注意：这只是临时方案，实际使用时需要从外部用户服务获取真实的 external_user_id
-- UPDATE users SET external_user_id = id WHERE external_user_id IS NULL;
