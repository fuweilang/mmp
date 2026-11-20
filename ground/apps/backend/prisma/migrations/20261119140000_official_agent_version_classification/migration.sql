-- Freeze display classification on published versions so rollback can restore it.
-- Null on historical rows; only versions published after this migration carry a snapshot.
ALTER TABLE "official_agent_version" ADD COLUMN "category" TEXT;
ALTER TABLE "official_agent_version" ADD COLUMN "capabilities" JSONB;
ALTER TABLE "official_agent_version" ADD COLUMN "kind" "OfficialAgentKind";
