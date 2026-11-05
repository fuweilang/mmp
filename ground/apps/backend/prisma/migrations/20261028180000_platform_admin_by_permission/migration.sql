-- 总后台身份改为按角色权限判定：
-- 只有「角色权限里带 portal.admin.access」的账号才是平台管理员，
-- 自建角色（例如只授了 experts）不再因为 scope = PLATFORM 而拿到总后台。
UPDATE "user" AS u
SET is_platform_admin = EXISTS (
  SELECT 1
  FROM user_platform_role upr
  JOIN role_permission rp ON rp.role_id = upr.role_id
  WHERE upr.user_id = u.id
    AND rp.perm_key = 'portal.admin.access'
);