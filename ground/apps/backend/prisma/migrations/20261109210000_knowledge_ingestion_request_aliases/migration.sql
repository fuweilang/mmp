-- Preserve all original job keys and reserve aliases for future reused-index requests.
CREATE UNIQUE INDEX kc_ingestion_job_base_id_id_key ON kc_ingestion_job(base_id,id);
CREATE TABLE kc_ingestion_request (
  base_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  job_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT kc_ingestion_request_pkey PRIMARY KEY (base_id,idempotency_key),
  CONSTRAINT kc_ingestion_request_base_id_fkey FOREIGN KEY (base_id) REFERENCES kc_base(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT kc_ingestion_request_base_id_job_id_fkey FOREIGN KEY (base_id,job_id) REFERENCES kc_ingestion_job(base_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT kc_ingestion_request_key_check CHECK (char_length(idempotency_key) BETWEEN 1 AND 128 AND btrim(idempotency_key)<>''),
  CONSTRAINT kc_ingestion_request_hash_check CHECK (request_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX kc_ingestion_request_job_id_idx ON kc_ingestion_request(job_id);
INSERT INTO kc_ingestion_request(base_id,idempotency_key,request_hash,job_id,created_at)
 SELECT base_id,idempotency_key,request_hash,id,created_at FROM kc_ingestion_job;
CREATE TRIGGER kc_ingestion_request_immutable BEFORE UPDATE OR DELETE ON kc_ingestion_request FOR EACH ROW EXECUTE FUNCTION kc_no_mutation();
