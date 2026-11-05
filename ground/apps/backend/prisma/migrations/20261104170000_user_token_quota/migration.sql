-- 用户级月度 Token 额度（0 = 不限）。企业级额度沿用 quota.monthly_tokens。
CREATE TABLE user_token_quota (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  monthly_tokens INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX user_token_quota_tenant_user ON user_token_quota (tenant_id, user_id);
