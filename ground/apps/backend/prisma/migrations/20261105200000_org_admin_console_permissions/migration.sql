-- Restore the console keys the built-in org_admin preset is expected to have.
-- Older seeds only added portal.console.billing, so roles created before later
-- console pages were added stayed without workbench/kb/roles/usage.
INSERT INTO "role_permission" ("id", "role_id", "perm_key")
SELECT gen_random_uuid()::text, r."id", keys."perm_key"
FROM "role" r
CROSS JOIN (VALUES
  ('portal.console.access'),
  ('portal.console.workbench'),
  ('portal.console.kb'),
  ('portal.console.members'),
  ('portal.console.roles'),
  ('portal.console.usage'),
  ('portal.console.settings'),
  ('portal.console.billing')
) AS keys("perm_key")
WHERE r."key" = 'org_admin'
  AND NOT EXISTS (
    SELECT 1
    FROM "role_permission" rp
    WHERE rp."role_id" = r."id"
      AND rp."perm_key" = keys."perm_key"
  );