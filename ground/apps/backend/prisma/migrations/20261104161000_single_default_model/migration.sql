-- Preserve one existing default deterministically before enforcing uniqueness.
UPDATE llm_model SET is_preferred = false WHERE is_preferred AND id <> (
  SELECT id FROM llm_model WHERE is_preferred ORDER BY sort_order, model_id, id LIMIT 1
);
CREATE UNIQUE INDEX llm_single_preferred_model ON llm_model ((true)) WHERE is_preferred;
