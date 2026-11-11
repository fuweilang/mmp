-- Additive only. Baseline drift in legacy tables is deliberately excluded.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "kc_base" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "tenant_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kc_base_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kc_profile" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "dimension" INTEGER,
    "tokenizer" TEXT NOT NULL,
    "timeout_ms" INTEGER NOT NULL,
    "batch_size" INTEGER NOT NULL,
    "max_input_tokens" INTEGER NOT NULL,
    "max_response_bytes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "predecessor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kc_profile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kc_document" (
    "id" TEXT NOT NULL,
    "base_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kc_document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kc_document_revision" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kc_document_revision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kc_index_revision" (
    "id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason_code" TEXT,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMP(3),

    CONSTRAINT "kc_index_revision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kc_chunk" (
    "id" TEXT NOT NULL,
    "index_revision_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "source_text" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "tokenizer" TEXT NOT NULL,
    "source_start" INTEGER NOT NULL,
    "source_end" INTEGER NOT NULL,
    "locator" JSONB NOT NULL,

    CONSTRAINT "kc_chunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kc_embedding" (
    "chunk_id" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "vector" vector NOT NULL,

    CONSTRAINT "kc_embedding_pkey" PRIMARY KEY ("chunk_id")
);

CREATE TABLE "kc_ingestion_job" (
    "id" TEXT NOT NULL,
    "base_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "index_revision_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_token" TEXT,
    "lease_until" TIMESTAMP(3),
    "heartbeat_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kc_ingestion_job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kc_release" (
    "sealed" BOOLEAN NOT NULL DEFAULT false,
    "id" TEXT NOT NULL,
    "base_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kc_release_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kc_release_item" (
    "release_id" TEXT NOT NULL,
    "index_revision_id" TEXT NOT NULL,

    CONSTRAINT "kc_release_item_pkey" PRIMARY KEY ("release_id","index_revision_id")
);

CREATE TABLE "kc_retrieval_trace" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "scope" TEXT NOT NULL,
    "expert_id" TEXT,
    "release_ids" TEXT[],
    "status" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "degradation" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kc_retrieval_trace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kc_provider_usage" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "operation_id" TEXT,
    "task" TEXT NOT NULL,
    "input_count" INTEGER NOT NULL,
    "estimated_tokens" INTEGER NOT NULL,
    "actual_tokens" INTEGER,
    "status" TEXT NOT NULL,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kc_provider_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kc_base_scope_tenant_id_enabled_idx" ON "kc_base"("scope", "tenant_id", "enabled");

CREATE INDEX "kc_profile_provider_id_task_enabled_idx" ON "kc_profile"("provider_id", "task", "enabled");

CREATE INDEX "kc_document_base_id_enabled_idx" ON "kc_document"("base_id", "enabled");

CREATE UNIQUE INDEX "kc_document_revision_document_id_content_hash_key" ON "kc_document_revision"("document_id", "content_hash");

CREATE INDEX "kc_index_revision_status_idx" ON "kc_index_revision"("status");

CREATE UNIQUE INDEX "kc_index_revision_revision_id_profile_id_key" ON "kc_index_revision"("revision_id", "profile_id");

CREATE UNIQUE INDEX "kc_chunk_index_revision_id_ordinal_key" ON "kc_chunk"("index_revision_id", "ordinal");

CREATE UNIQUE INDEX "kc_ingestion_job_index_revision_id_key" ON "kc_ingestion_job"("index_revision_id");

CREATE INDEX "kc_ingestion_job_status_available_at_lease_until_idx" ON "kc_ingestion_job"("status", "available_at", "lease_until");

CREATE UNIQUE INDEX "kc_ingestion_job_base_id_idempotency_key_key" ON "kc_ingestion_job"("base_id", "idempotency_key");

CREATE UNIQUE INDEX "kc_release_base_id_version_key" ON "kc_release"("base_id", "version");

CREATE INDEX "kc_retrieval_trace_actor_user_id_request_id_idx" ON "kc_retrieval_trace"("actor_user_id", "request_id");

CREATE INDEX "kc_retrieval_trace_tenant_id_created_at_idx" ON "kc_retrieval_trace"("tenant_id", "created_at");

CREATE INDEX "kc_provider_usage_operation_id_idx" ON "kc_provider_usage"("operation_id");

CREATE INDEX "kc_provider_usage_profile_id_created_at_idx" ON "kc_provider_usage"("profile_id", "created_at");

ALTER TABLE "kc_profile" ADD CONSTRAINT "kc_profile_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "llm_provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kc_document" ADD CONSTRAINT "kc_document_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "kc_base"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kc_document_revision" ADD CONSTRAINT "kc_document_revision_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "kc_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kc_index_revision" ADD CONSTRAINT "kc_index_revision_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "kc_document_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kc_index_revision" ADD CONSTRAINT "kc_index_revision_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "kc_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kc_chunk" ADD CONSTRAINT "kc_chunk_index_revision_id_fkey" FOREIGN KEY ("index_revision_id") REFERENCES "kc_index_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kc_embedding" ADD CONSTRAINT "kc_embedding_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "kc_chunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kc_ingestion_job" ADD CONSTRAINT "kc_ingestion_job_index_revision_id_fkey" FOREIGN KEY ("index_revision_id") REFERENCES "kc_index_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kc_release" ADD CONSTRAINT "kc_release_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "kc_base"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kc_release_item" ADD CONSTRAINT "kc_release_item_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "kc_release"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kc_release_item" ADD CONSTRAINT "kc_release_item_index_revision_id_fkey" FOREIGN KEY ("index_revision_id") REFERENCES "kc_index_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kc_provider_usage" ADD CONSTRAINT "kc_provider_usage_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "kc_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE kc_base ADD CONSTRAINT kc_base_scope_check CHECK ((scope='PLATFORM' AND tenant_id IS NULL) OR (scope='TENANT' AND tenant_id IS NOT NULL));
ALTER TABLE kc_base ADD CONSTRAINT kc_base_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE RESTRICT;
ALTER TABLE kc_profile ADD CONSTRAINT kc_profile_contract_check CHECK (
  (task='EMBEDDING' AND adapter='OPENAI_EMBEDDINGS' AND dimension BETWEEN 1 AND 16000 OR task='RERANK' AND adapter='COMPATIBLE_RERANK' AND dimension IS NULL)
  AND tokenizer IN ('cl100k_base','o200k_base') AND timeout_ms BETWEEN 1 AND 120000 AND batch_size BETWEEN 1 AND 128
  AND max_input_tokens BETWEEN 1 AND 131072 AND max_response_bytes BETWEEN 1024 AND 16777216);
ALTER TABLE kc_profile ADD CONSTRAINT kc_profile_predecessor_fk FOREIGN KEY (predecessor_id) REFERENCES kc_profile(id) ON DELETE RESTRICT;
ALTER TABLE kc_ingestion_job ADD CONSTRAINT kc_job_base_fk FOREIGN KEY (base_id) REFERENCES kc_base(id) ON DELETE RESTRICT;
ALTER TABLE kc_ingestion_job ADD CONSTRAINT kc_job_state_check CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED') AND attempts BETWEEN 0 AND 4);
ALTER TABLE kc_index_revision ADD CONSTRAINT kc_index_status_check CHECK (status IN ('PENDING','READY','PARTIAL','DOWNLOAD_ONLY','FAILED','CANCELLED'));
ALTER TABLE kc_document_revision ADD CONSTRAINT kc_revision_size_check CHECK (size_bytes > 0 AND size_bytes <= 20971520 AND content_hash ~ '^[0-9a-f]{64}$' AND storage_key = content_hash);
ALTER TABLE kc_chunk ADD CONSTRAINT kc_chunk_bounds_check CHECK (ordinal>=0 AND token_count>0 AND source_start>=0 AND source_end>source_start);
ALTER TABLE kc_embedding ADD CONSTRAINT kc_embedding_dims_check CHECK (dimension BETWEEN 1 AND 16000 AND vector_dims(vector)=dimension AND vector_norm(vector)>0);
ALTER TABLE kc_provider_usage ADD CONSTRAINT kc_usage_check CHECK (estimated_tokens>=0 AND (actual_tokens IS NULL OR actual_tokens>=0) AND input_count>=0);
CREATE INDEX kc_chunk_lexical_idx ON kc_chunk USING GIN (to_tsvector('simple',text));
-- Variable-dimension vectors are isolated from legacy vector(64). Queries must select one immutable profile.
CREATE FUNCTION kc_no_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'knowledge immutable row'; END $$;
CREATE TRIGGER kc_revision_immutable BEFORE UPDATE OR DELETE ON kc_document_revision FOR EACH ROW EXECUTE FUNCTION kc_no_mutation();
CREATE TRIGGER kc_embedding_immutable BEFORE UPDATE OR DELETE ON kc_embedding FOR EACH ROW EXECUTE FUNCTION kc_no_mutation();
CREATE TRIGGER kc_chunk_immutable BEFORE UPDATE OR DELETE ON kc_chunk FOR EACH ROW EXECUTE FUNCTION kc_no_mutation();
CREATE FUNCTION kc_profile_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'enabled') IS DISTINCT FROM (to_jsonb(OLD)-'enabled') THEN RAISE EXCEPTION 'knowledge profile contract frozen'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER kc_profile_immutable BEFORE UPDATE OR DELETE ON kc_profile FOR EACH ROW EXECUTE FUNCTION kc_profile_frozen();
CREATE FUNCTION kc_base_document_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='kc_base' AND (NEW.scope IS DISTINCT FROM OLD.scope OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN RAISE EXCEPTION 'knowledge scope frozen'; END IF;
 IF TG_TABLE_NAME='kc_document' AND NEW.base_id IS DISTINCT FROM OLD.base_id THEN RAISE EXCEPTION 'knowledge document base frozen'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER kc_base_scope_frozen BEFORE UPDATE ON kc_base FOR EACH ROW EXECUTE FUNCTION kc_base_document_frozen();
CREATE TRIGGER kc_document_base_frozen BEFORE UPDATE ON kc_document FOR EACH ROW EXECUTE FUNCTION kc_base_document_frozen();
CREATE FUNCTION kc_validate_index() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n integer; e integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'knowledge index immutable'; END IF;
 IF TG_OP='UPDATE' AND (OLD.status='READY' OR NEW.revision_id<>OLD.revision_id OR NEW.profile_id<>OLD.profile_id) THEN RAISE EXCEPTION 'knowledge index immutable'; END IF;
 IF NEW.status='READY' THEN
  SELECT count(*),count(ke.chunk_id) INTO n,e FROM kc_chunk c LEFT JOIN kc_embedding ke ON ke.chunk_id=c.id WHERE c.index_revision_id=NEW.id;
  IF n=0 OR n<>e OR n<>NEW.chunk_count THEN RAISE EXCEPTION 'incomplete semantic index'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER kc_index_validate BEFORE INSERT OR UPDATE OR DELETE ON kc_index_revision FOR EACH ROW EXECUTE FUNCTION kc_validate_index();
CREATE FUNCTION kc_validate_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ix kc_index_revision; expected integer;
BEGIN
 IF TG_TABLE_NAME='kc_chunk' THEN SELECT * INTO ix FROM kc_index_revision WHERE id=NEW.index_revision_id FOR UPDATE;
 ELSE SELECT i.* INTO ix FROM kc_chunk c JOIN kc_index_revision i ON c.index_revision_id=i.id WHERE c.id=NEW.chunk_id FOR UPDATE OF i; END IF;
 IF ix.status<>'PENDING' THEN RAISE EXCEPTION 'knowledge index sealed'; END IF;
 IF TG_TABLE_NAME='kc_embedding' THEN
  SELECT dimension INTO expected FROM kc_profile WHERE id=ix.profile_id AND task='EMBEDDING';
  IF expected IS NULL OR expected<>NEW.dimension THEN RAISE EXCEPTION 'knowledge embedding dimension mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER kc_chunk_insert BEFORE INSERT ON kc_chunk FOR EACH ROW EXECUTE FUNCTION kc_validate_insert();
CREATE TRIGGER kc_embedding_insert BEFORE INSERT ON kc_embedding FOR EACH ROW EXECUTE FUNCTION kc_validate_insert();
CREATE FUNCTION kc_release_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.sealed OR NOT NEW.sealed OR (to_jsonb(NEW)-'sealed') IS DISTINCT FROM (to_jsonb(OLD)-'sealed') THEN RAISE EXCEPTION 'knowledge release immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER kc_release_immutable BEFORE UPDATE OR DELETE ON kc_release FOR EACH ROW EXECUTE FUNCTION kc_release_frozen();
CREATE FUNCTION kc_release_item_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r kc_release; bid text; s text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'knowledge release item immutable'; END IF;
 SELECT * INTO r FROM kc_release WHERE id=NEW.release_id FOR UPDATE;
 SELECT d.base_id,i.status INTO bid,s FROM kc_index_revision i JOIN kc_document_revision v ON v.id=i.revision_id JOIN kc_document d ON d.id=v.document_id WHERE i.id=NEW.index_revision_id;
 IF r.sealed OR bid IS DISTINCT FROM r.base_id OR s IS DISTINCT FROM 'READY' THEN RAISE EXCEPTION 'invalid knowledge release item'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER kc_release_item_immutable BEFORE INSERT OR UPDATE OR DELETE ON kc_release_item FOR EACH ROW EXECUTE FUNCTION kc_release_item_frozen();
