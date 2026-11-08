-- Official skills + package revisions + agent skill links (unapplied; do not auto-deploy).

CREATE TYPE "OfficialSkillCategory" AS ENUM ('common', 'content', 'business', 'expertise');

ALTER TABLE "official_agent_version"
  ADD COLUMN IF NOT EXISTS "linked_skill_summaries" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS "official_skill" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "category" "OfficialSkillCategory",
  "enabled_at" TIMESTAMP(3),
  "current_revision" INTEGER NOT NULL DEFAULT 0,
  "current_package_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "official_skill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "official_skill_key_key" ON "official_skill"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "official_skill_current_package_id_key" ON "official_skill"("current_package_id");
CREATE INDEX IF NOT EXISTS "official_skill_enabled_at_idx" ON "official_skill"("enabled_at");
CREATE INDEX IF NOT EXISTS "official_skill_category_idx" ON "official_skill"("category");

CREATE TABLE IF NOT EXISTS "official_skill_package" (
  "id" TEXT NOT NULL,
  "skill_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "storage_path" TEXT NOT NULL,
  "manifest" JSONB NOT NULL,
  "instruction_bytes" INTEGER NOT NULL,
  "resource_count" INTEGER NOT NULL DEFAULT 0,
  "source_zip_path" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "official_skill_package_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "official_skill_package_skill_id_revision_key" ON "official_skill_package"("skill_id", "revision");
CREATE INDEX IF NOT EXISTS "official_skill_package_skill_id_idx" ON "official_skill_package"("skill_id");

CREATE TABLE IF NOT EXISTS "official_agent_skill_link" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "skill_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "official_agent_skill_link_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "official_agent_skill_link_agent_id_skill_id_key" ON "official_agent_skill_link"("agent_id", "skill_id");
CREATE INDEX IF NOT EXISTS "official_agent_skill_link_skill_id_idx" ON "official_agent_skill_link"("skill_id");

DO $$ BEGIN
  ALTER TABLE "official_skill_package"
    ADD CONSTRAINT "official_skill_package_skill_id_fkey"
    FOREIGN KEY ("skill_id") REFERENCES "official_skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "official_skill"
    ADD CONSTRAINT "official_skill_current_package_id_fkey"
    FOREIGN KEY ("current_package_id") REFERENCES "official_skill_package"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "official_agent_skill_link"
    ADD CONSTRAINT "official_agent_skill_link_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "official_agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "official_agent_skill_link"
    ADD CONSTRAINT "official_agent_skill_link_skill_id_fkey"
    FOREIGN KEY ("skill_id") REFERENCES "official_skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
