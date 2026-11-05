-- unify-ground-octop-rbac phase1: Role / RolePermission / UserPlatformRole

CREATE TYPE "RoleScope" AS ENUM ('PLATFORM', 'ORG_PRESET');

CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "RoleScope" NOT NULL,
    "built_in" BOOLEAN NOT NULL DEFAULT true,
    "editable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permission" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "perm_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_platform_role" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_platform_role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "role_key_key" ON "role"("key");
CREATE INDEX "role_scope_idx" ON "role"("scope");

CREATE UNIQUE INDEX "role_permission_role_id_perm_key_key" ON "role_permission"("role_id", "perm_key");
CREATE INDEX "role_permission_perm_key_idx" ON "role_permission"("perm_key");

CREATE UNIQUE INDEX "user_platform_role_user_id_key" ON "user_platform_role"("user_id");
CREATE INDEX "user_platform_role_role_id_idx" ON "user_platform_role"("role_id");

ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_platform_role" ADD CONSTRAINT "user_platform_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_platform_role" ADD CONSTRAINT "user_platform_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed built-in role rows (permission packs filled by prisma seed / app)
INSERT INTO "role" ("id", "key", "name", "description", "scope", "built_in", "editable", "created_at", "updated_at") VALUES
  ('role_super_admin', 'super_admin', '超级管理员', '平台超管：Catalog 全量权限（含 roles.write）', 'PLATFORM', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_platform_admin', 'platform_admin', '平台管理员', '总后台用户/企业/角色只读；无 roles.write', 'PLATFORM', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_org_owner', 'org_owner', '企业所有者', '企业控制台全开 + Octop 业务/控制模块', 'ORG_PRESET', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_org_admin', 'org_admin', '企业管理员', '业务模块 + console 准入与成员管理', 'ORG_PRESET', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_org_member', 'org_member', '企业成员', 'BASELINE（nav+settings）；无 console', 'ORG_PRESET', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Backfill: is_platform_admin=true without platform role → super_admin
INSERT INTO "user_platform_role" ("id", "user_id", "role_id", "created_at", "updated_at")
SELECT
  'upr_' || u."id",
  u."id",
  'role_super_admin',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "user" u
WHERE u."is_platform_admin" = true
  AND NOT EXISTS (
    SELECT 1 FROM "user_platform_role" upr WHERE upr."user_id" = u."id"
  );
