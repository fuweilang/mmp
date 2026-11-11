ALTER TABLE official_agent ADD COLUMN execution_config jsonb NOT NULL DEFAULT '{"route":"LEGACY"}';
ALTER TABLE official_agent_version ADD COLUMN execution_config jsonb NOT NULL DEFAULT '{"route":"LEGACY"}';
ALTER TABLE kc_retrieval_trace ADD COLUMN expert_version_id text, ADD COLUMN preview_id text;
CREATE TABLE official_expert_preview (
 id text PRIMARY KEY,
 agent_id text NOT NULL,
 actor_user_id text NOT NULL,
 snapshot jsonb NOT NULL,
 expires_at timestamp(3) NOT NULL,
 created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT preview_expiry_valid CHECK (expires_at > created_at)
);
CREATE INDEX official_expert_preview_actor_user_id_expires_at_idx ON official_expert_preview(actor_user_id,expires_at);
CREATE FUNCTION expert_snapshot_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'expert snapshot is immutable'; END $$;
CREATE TRIGGER official_expert_preview_immutable BEFORE UPDATE ON official_expert_preview FOR EACH ROW EXECUTE FUNCTION expert_snapshot_no_update();
CREATE TRIGGER official_agent_version_immutable BEFORE UPDATE ON official_agent_version FOR EACH ROW EXECUTE FUNCTION expert_snapshot_no_update();
