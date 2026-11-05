-- Grant portal.admin.audit to built-in platform roles (super_admin / platform_admin).
INSERT INTO role_permission (id, role_id, perm_key, created_at)
SELECT
  concat('rp_audit_', r.key),
  r.id,
  'portal.admin.audit',
  CURRENT_TIMESTAMP
FROM role r
WHERE r.key IN ('super_admin', 'platform_admin')
  AND NOT EXISTS (
    SELECT 1 FROM role_permission rp
    WHERE rp.role_id = r.id AND rp.perm_key = 'portal.admin.audit'
  );
