-- Admin-managed official agent avatars (per-agent unique file under uploads/official-avatars).
ALTER TABLE "official_agent" ADD COLUMN IF NOT EXISTS "custom_avatar_path" TEXT;
