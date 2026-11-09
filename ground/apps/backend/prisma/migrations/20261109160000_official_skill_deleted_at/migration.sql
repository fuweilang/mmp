-- Hide a skill from admin lists and new sessions without removing packages or history.
ALTER TABLE "official_skill" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "official_skill_deleted_at_idx" ON "official_skill"("deleted_at");
