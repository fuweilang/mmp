CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "tenant"
  ADD COLUMN "logo_url" TEXT,
  ADD COLUMN "welcome_message" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "default_agent_id" TEXT;

CREATE TABLE "kb_chunk" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kb_chunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "usage_event" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quota" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "monthly_turns" INTEGER NOT NULL DEFAULT 1000,
    "monthly_tokens" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quota_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kb_chunk_tenant_id_idx" ON "kb_chunk"("tenant_id");
CREATE INDEX "kb_chunk_document_id_idx" ON "kb_chunk"("document_id");
CREATE INDEX "kb_chunk_content_trgm_idx" ON "kb_chunk" USING gin ("content" gin_trgm_ops);
CREATE INDEX "kb_chunk_embedding_idx" ON "kb_chunk" USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX "usage_event_tenant_id_created_at_idx" ON "usage_event"("tenant_id", "created_at");
CREATE INDEX "usage_event_user_id_idx" ON "usage_event"("user_id");

CREATE UNIQUE INDEX "quota_tenant_id_key" ON "quota"("tenant_id");

ALTER TABLE "kb_chunk" ADD CONSTRAINT "kb_chunk_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kb_chunk" ADD CONSTRAINT "kb_chunk_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "kb_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quota" ADD CONSTRAINT "quota_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
