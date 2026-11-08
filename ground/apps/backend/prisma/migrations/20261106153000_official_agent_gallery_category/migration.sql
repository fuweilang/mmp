-- Gallery presentation fields on editable parent agent (not frozen versions).
CREATE TYPE "OfficialAgentCategory" AS ENUM ('common', 'productivity', 'content', 'sales', 'expertise', 'analytics');

ALTER TABLE "official_agent" ADD COLUMN "category" "OfficialAgentCategory",
ADD COLUMN "capabilities" JSONB NOT NULL DEFAULT '[]';
