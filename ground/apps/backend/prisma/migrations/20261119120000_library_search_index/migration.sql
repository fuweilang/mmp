CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "library_version" ADD COLUMN "summary" TEXT;
ALTER TABLE "library_chunk" ADD COLUMN "embedding" vector(1024);

UPDATE "library_version" AS v
SET "summary" = left(c.content, 400)
FROM "library_chunk" AS c
WHERE c.version_id = v.id
  AND c.ordinal = 0
  AND v.summary IS NULL
  AND v.parse_status = 'READY';

CREATE INDEX "library_chunk_content_trgm" ON "library_chunk" USING gin (content gin_trgm_ops);
CREATE INDEX "library_node_name_trgm" ON "library_node" USING gin (name gin_trgm_ops);
CREATE INDEX "library_version_summary_trgm" ON "library_version" USING gin (summary gin_trgm_ops);
CREATE INDEX "library_chunk_embedding_hnsw" ON "library_chunk" USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
