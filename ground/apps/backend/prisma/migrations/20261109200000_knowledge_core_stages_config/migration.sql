-- Add stage inspection and immutable parser/chunker configuration identity. Existing kc_* metadata is backfilled once; no legacy tables are changed.
ALTER TABLE kc_ingestion_job ADD COLUMN stage TEXT NOT NULL DEFAULT 'UPLOADED';
UPDATE kc_ingestion_job SET stage=CASE WHEN status='CANCELLED' THEN 'CANCELLED' WHEN status='FAILED' THEN 'FAILED' WHEN status='SUCCEEDED' THEN COALESCE((SELECT status FROM kc_index_revision WHERE id=index_revision_id),'FAILED') WHEN status='RUNNING' THEN 'PARSING' ELSE 'UPLOADED' END;
ALTER TABLE kc_ingestion_job ADD CONSTRAINT kc_job_stage_check CHECK (stage IN ('UPLOADED','PARSING','CHUNKING','EMBEDDING','INDEXING','READY','FAILED','PARTIAL','DOWNLOAD_ONLY','CANCELLED','PENDING'));
ALTER TABLE kc_profile ADD CONSTRAINT kc_embedding_dimension_required CHECK (task<>'EMBEDDING' OR dimension IS NOT NULL);
ALTER TABLE kc_document_revision ADD COLUMN parser_format TEXT;
ALTER TABLE kc_document_revision DISABLE TRIGGER kc_revision_immutable;
UPDATE kc_document_revision SET parser_format=COALESCE(lower(substring(original_name from '\.[^./]+$')),'');
ALTER TABLE kc_document_revision ENABLE TRIGGER kc_revision_immutable;
ALTER TABLE kc_document_revision ALTER COLUMN parser_format SET NOT NULL;
DROP INDEX kc_document_revision_document_id_content_hash_key;
CREATE UNIQUE INDEX kc_revision_content_format_key ON kc_document_revision(document_id,content_hash,parser_format);
ALTER TABLE kc_index_revision ADD COLUMN parser_version TEXT, ADD COLUMN chunker_version TEXT, ADD COLUMN chunker_config JSONB, ADD COLUMN index_config_hash TEXT;
ALTER TABLE kc_index_revision DISABLE TRIGGER kc_index_validate;
UPDATE kc_index_revision i SET parser_version='knowledge-parser-v1',chunker_version='token-chunker-v1',
 chunker_config=jsonb_build_object('targetTokens',LEAST(600,p.max_input_tokens),'maxTokens',LEAST(900,p.max_input_tokens),'overlapTokens',LEAST(80,LEAST(600,p.max_input_tokens)-1)),
 index_config_hash=encode(sha256(convert_to(format('{"parserVersion":"knowledge-parser-v1","chunkerVersion":"token-chunker-v1","targetTokens":%s,"maxTokens":%s,"overlapTokens":%s}',LEAST(600,p.max_input_tokens),LEAST(900,p.max_input_tokens),LEAST(80,LEAST(600,p.max_input_tokens)-1)),'UTF8')),'hex')
 FROM kc_profile p WHERE p.id=i.profile_id;
ALTER TABLE kc_index_revision ENABLE TRIGGER kc_index_validate;
ALTER TABLE kc_index_revision ALTER COLUMN parser_version SET NOT NULL, ALTER COLUMN chunker_version SET NOT NULL, ALTER COLUMN chunker_config SET NOT NULL, ALTER COLUMN index_config_hash SET NOT NULL;
DROP INDEX kc_index_revision_revision_id_profile_id_key;
CREATE UNIQUE INDEX kc_index_revision_config_key ON kc_index_revision(revision_id,profile_id,index_config_hash);
CREATE OR REPLACE FUNCTION kc_base_document_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='kc_base' THEN
  IF NEW.scope IS DISTINCT FROM OLD.scope OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'knowledge scope frozen'; END IF;
 ELSE
  IF NEW.base_id IS DISTINCT FROM OLD.base_id THEN RAISE EXCEPTION 'knowledge document base frozen'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION kc_validate_index() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n integer; e integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'knowledge index immutable'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status='READY' OR NEW.revision_id<>OLD.revision_id OR NEW.profile_id<>OLD.profile_id
   OR NEW.parser_version<>OLD.parser_version OR NEW.chunker_version<>OLD.chunker_version
   OR NEW.chunker_config<>OLD.chunker_config OR NEW.index_config_hash<>OLD.index_config_hash THEN RAISE EXCEPTION 'knowledge index immutable'; END IF;
 END IF;
 IF NEW.status='READY' THEN
  SELECT count(*),count(ke.chunk_id) INTO n,e FROM kc_chunk c LEFT JOIN kc_embedding ke ON ke.chunk_id=c.id WHERE c.index_revision_id=NEW.id;
  IF n=0 OR n<>e OR n<>NEW.chunk_count THEN RAISE EXCEPTION 'incomplete semantic index'; END IF;
 END IF;
 RETURN NEW;
END $$;
