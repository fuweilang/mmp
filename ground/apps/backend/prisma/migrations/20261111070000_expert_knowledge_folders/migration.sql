ALTER TABLE kc_base ADD COLUMN owner_agent_id TEXT,
  ADD COLUMN owner_agent_name TEXT,
  ADD COLUMN auto_update BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN current_release_id TEXT;
ALTER TABLE kc_document ADD COLUMN deleted_at TIMESTAMP(3);
CREATE UNIQUE INDEX kc_base_owner_agent_id_key ON kc_base(owner_agent_id);
CREATE UNIQUE INDEX kc_base_current_release_id_key ON kc_base(current_release_id);
ALTER TABLE kc_base ADD CONSTRAINT kc_base_owner_agent_id_fkey FOREIGN KEY(owner_agent_id) REFERENCES official_agent(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE kc_base ADD CONSTRAINT kc_base_current_release_id_fkey FOREIGN KEY(current_release_id) REFERENCES kc_release(id) ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE kc_base b SET auto_update=true,
  current_release_id=(SELECT r.id FROM kc_release r WHERE r.base_id=b.id AND r.sealed ORDER BY r.version DESC LIMIT 1)
  WHERE b.scope='PLATFORM' AND b.tenant_id IS NULL;
