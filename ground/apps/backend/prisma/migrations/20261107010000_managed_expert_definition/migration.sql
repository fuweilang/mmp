-- Additive only: preserve legacy records, IDs, statuses and all published versions.
ALTER TABLE "official_agent" ADD COLUMN "expert_definition" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "official_agent_version" ADD COLUMN "expert_definition" JSONB NOT NULL DEFAULT '{}';
