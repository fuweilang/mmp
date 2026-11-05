-- 自建角色不再算平台身份：把这类绑定下沉到该用户的企业成员关系上，然后清掉平台绑定。
-- 平台身份只保留超级管理员 / 平台管理员。

-- 1) 有企业的用户：角色下沉到成员关系（企业内角色 = 原平台角色）
UPDATE org_member m
SET role_id = upr.role_id,
    role = CASE WHEN r.key = 'org_admin' THEN 'ADMIN'::"MemberRole" ELSE 'MEMBER'::"MemberRole" END
FROM user_platform_role upr
JOIN role r ON r.id = upr.role_id
WHERE m.user_id = upr.user_id
  AND r.key NOT IN ('super_admin', 'platform_admin');

-- 2) 删除这些平台绑定
DELETE FROM user_platform_role upr
USING role r
WHERE r.id = upr.role_id
  AND r.key NOT IN ('super_admin', 'platform_admin');

-- 3) 总后台身份按剩余平台绑定重算
UPDATE "user" u
SET is_platform_admin = EXISTS (
  SELECT 1
  FROM user_platform_role upr
  JOIN role r ON r.id = upr.role_id
  WHERE upr.user_id = u.id
    AND r.key IN ('super_admin', 'platform_admin')
);