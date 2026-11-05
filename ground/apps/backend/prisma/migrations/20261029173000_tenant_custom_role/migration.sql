-- 企业自建角色：role 表新增 ORG_CUSTOM scope 与 tenant_id 归属列。
-- ORG_CUSTOM 角色只允许 portal_console + Octop 业务包权限，绑定走 user_role（权限并集），不动 org_member.role 历史枚举。

ALTER TYPE "RoleScope" ADD VALUE 'ORG_CUSTOM';

ALTER TABLE role ADD COLUMN tenant_id text;

CREATE INDEX role_tenant_id_idx ON role (tenant_id);

ALTER TABLE role
  ADD CONSTRAINT role_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenant (id)
  ON DELETE CASCADE ON UPDATE CASCADE;
