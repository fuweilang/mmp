CREATE TABLE llm_health_state (
  id TEXT PRIMARY KEY,
  model_id TEXT UNIQUE REFERENCES llm_model(id) ON DELETE CASCADE,
  provider_id TEXT UNIQUE REFERENCES llm_provider(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unchecked',
  failures INTEGER NOT NULL DEFAULT 0,
  checked_at TIMESTAMP(3),
  retry_at TIMESTAMP(3),
  reason TEXT,
  latency_ms INTEGER,
  CHECK ((model_id IS NULL) <> (provider_id IS NULL))
);
