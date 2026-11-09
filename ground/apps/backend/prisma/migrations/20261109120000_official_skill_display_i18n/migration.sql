-- Official skill display i18n: keep crawl originals, mark machine/manual provenance.
-- Does not alter package SKILL.md / instruction bodies.
ALTER TABLE "official_skill" ADD COLUMN IF NOT EXISTS "source_name" TEXT;
ALTER TABLE "official_skill" ADD COLUMN IF NOT EXISTS "source_summary" TEXT NOT NULL DEFAULT '';
ALTER TABLE "official_skill" ADD COLUMN IF NOT EXISTS "display_provenance" TEXT NOT NULL DEFAULT 'source';
ALTER TABLE "official_skill" ADD COLUMN IF NOT EXISTS "display_locale" TEXT NOT NULL DEFAULT 'zh-Hans';
ALTER TABLE "official_skill" ADD COLUMN IF NOT EXISTS "display_translated_at" TIMESTAMP(3);
ALTER TABLE "official_skill" ADD COLUMN IF NOT EXISTS "display_model_ref" TEXT;
ALTER TABLE "official_skill" ADD COLUMN IF NOT EXISTS "display_source_hash" TEXT;

-- Backfill originals from current display once (may already be Chinese for earlier imports).
UPDATE "official_skill"
SET
  "source_name" = COALESCE("source_name", "name"),
  "source_summary" = CASE WHEN "source_summary" = '' THEN "summary" ELSE "source_summary" END
WHERE "source_name" IS NULL OR "source_summary" = '';
