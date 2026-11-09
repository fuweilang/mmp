-- Multi-category skills: keep the old single value as a one-element array.
ALTER TABLE "official_skill" ADD COLUMN IF NOT EXISTS "categories" "OfficialSkillCategory"[] NOT NULL DEFAULT ARRAY[]::"OfficialSkillCategory"[];

UPDATE "official_skill"
SET "categories" = ARRAY["category"]::"OfficialSkillCategory"[]
WHERE "category" IS NOT NULL AND cardinality("categories") = 0;

DROP INDEX IF EXISTS "official_skill_category_idx";

ALTER TABLE "official_skill" DROP COLUMN IF EXISTS "category";

CREATE INDEX IF NOT EXISTS "official_skill_categories_idx" ON "official_skill" USING GIN ("categories");
