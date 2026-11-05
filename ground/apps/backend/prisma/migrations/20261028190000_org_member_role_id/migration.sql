-- 企业成员可以持有任意角色（含角色管理里的自建角色），不再只限于 ADMIN/MEMBER 两档。
ALTER TABLE org_member ADD COLUMN role_id text;

-- 存量数据：按历史枚举回填到对应的企业预设角色。
UPDATE org_member m
SET role_id = r.id
FROM role r
WHERE r.key = CASE m.role WHEN 'MEMBER' THEN 'org_member' ELSE 'org_admin' END;

CREATE INDEX org_member_role_id_idx ON org_member (role_id);

ALTER TABLE org_member
  ADD CONSTRAINT org_member_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES role (id)
  ON DELETE SET NULL ON UPDATE CASCADE;