-- 企业侧角色简化为「企业管理员 / 企业成员」两档
-- 1. 历史 OWNER 成员统一改为 ADMIN（企业管理员）
UPDATE "org_member" SET "role" = 'ADMIN' WHERE "role" = 'OWNER';

-- 2. 解绑仍指向 org_owner 的平台角色绑定（外键为 Restrict）
DELETE FROM "user_platform_role"
WHERE "role_id" IN (SELECT "id" FROM "role" WHERE "key" = 'org_owner');

-- 3. 删除 org_owner 角色（role_permission 级联删除）
DELETE FROM "role" WHERE "key" = 'org_owner';