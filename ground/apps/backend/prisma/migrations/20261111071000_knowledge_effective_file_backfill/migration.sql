ALTER TABLE kc_document ADD COLUMN IF NOT EXISTS requested_index_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS kc_document_requested_index_id_key ON kc_document(requested_index_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kc_document_requested_index_id_fkey') THEN
    ALTER TABLE kc_document ADD CONSTRAINT kc_document_requested_index_id_fkey FOREIGN KEY(requested_index_id) REFERENCES kc_index_revision(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
-- Request order is independent of deduplicated immutable content/revision creation time.
UPDATE kc_document d SET requested_index_id=(
  SELECT j.index_revision_id FROM kc_ingestion_request request
  JOIN kc_ingestion_job j ON j.id=request.job_id
  JOIN kc_index_revision idx ON idx.id=j.index_revision_id
  JOIN kc_document_revision rev ON rev.id=idx.revision_id
  WHERE rev.document_id=d.id ORDER BY request.created_at DESC,request.idempotency_key DESC LIMIT 1
) WHERE d.requested_index_id IS NULL;
-- The latest release may be a file subset chosen by another expert. Build a complete effective-file release.
DO $$
DECLARE folder RECORD; wanted TEXT[]; target TEXT; next_version INTEGER;
BEGIN
  FOR folder IN SELECT * FROM kc_base WHERE scope='PLATFORM' AND tenant_id IS NULL AND auto_update AND enabled FOR UPDATE LOOP
    SELECT array_agg(chosen.id ORDER BY chosen.id) INTO wanted FROM (
      SELECT DISTINCT ON (doc.id) idx.id
      FROM kc_document doc JOIN kc_document_revision rev ON rev.document_id=doc.id
      JOIN kc_index_revision idx ON idx.revision_id=rev.id JOIN kc_profile profile ON profile.id=idx.profile_id
      WHERE doc.base_id=folder.id AND doc.enabled AND doc.deleted_at IS NULL AND idx.status='READY' AND profile.enabled
      ORDER BY doc.id,(idx.id=doc.requested_index_id) DESC NULLS LAST,
        (EXISTS(SELECT 1 FROM kc_release_item old_item WHERE old_item.release_id=folder.current_release_id AND old_item.index_revision_id=idx.id)) DESC,
        rev.created_at DESC,idx.created_at DESC,idx.id DESC
    ) chosen;
    IF wanted IS NULL THEN
      UPDATE kc_base SET current_release_id=NULL WHERE id=folder.id;
      CONTINUE;
    END IF;
    target:=NULL;
    SELECT r.id INTO target FROM kc_release r WHERE r.base_id=folder.id AND r.sealed
      AND ARRAY(SELECT item.index_revision_id FROM kc_release_item item WHERE item.release_id=r.id ORDER BY item.index_revision_id)=wanted
      ORDER BY r.version DESC LIMIT 1;
    IF target IS NULL THEN
      target:='kb-auto-'||md5(folder.id||random()::text||clock_timestamp()::text);
      SELECT COALESCE(MAX(version),0)+1 INTO next_version FROM kc_release WHERE base_id=folder.id;
      INSERT INTO kc_release(id,base_id,version,created_at,sealed) VALUES(target,folder.id,next_version,CURRENT_TIMESTAMP,false);
      INSERT INTO kc_release_item(release_id,index_revision_id) SELECT target,unnest(wanted);
      UPDATE kc_release SET sealed=true WHERE id=target;
    END IF;
    UPDATE kc_base SET current_release_id=target WHERE id=folder.id;
  END LOOP;
END $$;
