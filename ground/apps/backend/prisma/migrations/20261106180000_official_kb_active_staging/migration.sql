-- Safe replacement for official KB: keep old READY docs until new staging is READY.
ALTER TABLE "official_kb_document" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

DROP INDEX IF EXISTS "official_kb_document_agent_id_asset_key_key";

-- At most one active document per (agent, asset_key).
CREATE UNIQUE INDEX IF NOT EXISTS "official_kb_document_agent_id_asset_key_active_key"
  ON "official_kb_document"("agent_id", "asset_key")
  WHERE "active" = true;

CREATE INDEX IF NOT EXISTS "official_kb_document_agent_id_active_status_idx"
  ON "official_kb_document"("agent_id", "active", "status");

CREATE INDEX IF NOT EXISTS "official_kb_document_agent_id_asset_key_idx"
  ON "official_kb_document"("agent_id", "asset_key");
