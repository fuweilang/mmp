-- Additive only. Existing experts, skills, grants, versions and sessions are untouched.
CREATE TABLE "official_catalog_preference" (
 "id" TEXT NOT NULL, "scope" TEXT NOT NULL, "user_id" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "resource_id" TEXT NOT NULL,
 "favourite" BOOLEAN NOT NULL DEFAULT false, "last_used_at" TIMESTAMP(3),
 "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "official_catalog_preference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "official_catalog_preference_scope_user_id_kind_resource_id_key" ON "official_catalog_preference"("scope","user_id","kind","resource_id");
CREATE INDEX "official_catalog_preference_scope_user_id_kind_last_used_at_idx" ON "official_catalog_preference"("scope","user_id","kind","last_used_at");
ALTER TABLE "official_catalog_preference" ADD CONSTRAINT "catalog_preference_kind_check" CHECK ("kind" IN ('expert','skill'));
