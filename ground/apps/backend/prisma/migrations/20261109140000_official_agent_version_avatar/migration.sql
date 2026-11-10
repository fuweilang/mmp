-- Freeze published avatar on version rows; null means fall back to packaged asset defaults.
ALTER TABLE "official_agent_version" ADD COLUMN IF NOT EXISTS "custom_avatar_path" TEXT;
