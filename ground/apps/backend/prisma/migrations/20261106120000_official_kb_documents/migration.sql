-- Official knowledge assets for published gallery agents (not enterprise private KB).
CREATE TABLE "official_kb_document" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "version_id" TEXT,
    "asset_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "status" "KbStatus" NOT NULL DEFAULT 'PENDING',
    "index_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_kb_document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "official_kb_chunk" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "official_kb_chunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "official_kb_document_agent_id_asset_key_key" ON "official_kb_document"("agent_id", "asset_key");
CREATE INDEX "official_kb_document_agent_id_status_idx" ON "official_kb_document"("agent_id", "status");
CREATE INDEX "official_kb_chunk_agent_id_idx" ON "official_kb_chunk"("agent_id");
CREATE INDEX "official_kb_chunk_document_id_idx" ON "official_kb_chunk"("document_id");

ALTER TABLE "official_kb_document" ADD CONSTRAINT "official_kb_document_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "official_agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "official_kb_document" ADD CONSTRAINT "official_kb_document_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "official_agent_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "official_kb_chunk" ADD CONSTRAINT "official_kb_chunk_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "official_kb_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
