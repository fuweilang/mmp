-- 一个用户可以有多个角色（权限取并集），所属企业仍然只有一家。

CREATE TABLE user_role (
  id          text PRIMARY KEY,
  user_id     text NOT NULL,
  role_id     text NOT NULL,
  created_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_role_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT user_role_role_id_fkey FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX user_role_user_id_role_id_key ON user_role (user_id, role_id);
CREATE INDEX user_role_role_id_idx ON user_role (role_id);

-- 迁移既有平台角色绑定
INSERT INTO user_role (id, user_id, role_id, created_at)
SELECT 'ur_' || upr.id, upr.user_id, upr.role_id, upr.created_at
FROM user_platform_role upr
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 迁移企业成员上的角色
INSERT INTO user_role (id, user_id, role_id, created_at)
SELECT 'ur_m_' || m.id, m.user_id, m.role_id, m.created_at
FROM org_member m
WHERE m.role_id IS NOT NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 没有角色的用户补企业预设角色，避免出现「无角色」导致权限全空
INSERT INTO user_role (id, user_id, role_id, created_at)
SELECT 'ur_p_' || m.id, m.user_id, r.id, m.created_at
FROM org_member m
JOIN role r ON r.key = CASE m.role WHEN 'MEMBER' THEN 'org_member' ELSE 'org_admin' END
WHERE NOT EXISTS (SELECT 1 FROM user_role ur WHERE ur.user_id = m.user_id)
ON CONFLICT (user_id, role_id) DO NOTHING;

DROP TABLE user_platform_role;