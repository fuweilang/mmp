-- Only new configs use the new denomination; existing balances and rates remain unchanged.
ALTER TABLE "platform_billing_config" ALTER COLUMN "ai_coins_per_yuan" SET DEFAULT 10000;
