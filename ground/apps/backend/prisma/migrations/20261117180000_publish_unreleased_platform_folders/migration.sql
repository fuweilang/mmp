-- Folders created in the knowledge library omitted auto-publish, so ready files had no release experts could bind.
UPDATE kc_base SET auto_update = true
WHERE scope = 'PLATFORM' AND tenant_id IS NULL AND enabled AND NOT auto_update;

DO $$
DECLARE folder RECORD; wanted TEXT[]; target TEXT; next_version INTEGER;
BEGIN
  FOR folder IN SELECT * FROM kc_base WHERE scope='PLATFORM' AND tenant_id IS NULL AND auto_update AND enabled AND current_release_id IS NULL FOR UPDATE LOOP
    SELECT array_agg(chosen.id ORDER BY chosen.id) INTO wanted FROM (
      SELECT DISTINCT ON (doc.id) idx.id
      FROM kc_document doc JOIN kc_document_revision rev ON rev.document_id=doc.id
      JOIN kc_index_revision idx ON idx.revision_id=rev.id JOIN kc_profile profile ON profile.id=idx.profile_id
      WHERE doc.base_id=folder.id AND doc.enabled AND doc.deleted_at IS NULL AND idx.status='READY' AND profile.enabled
      ORDER BY doc.id,(idx.id=doc.requested_index_id) DESC NULLS LAST,
        rev.created_at DESC,idx.created_at DESC,idx.id DESC
    ) chosen;
    IF wanted IS NULL THEN CONTINUE; END IF;
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
