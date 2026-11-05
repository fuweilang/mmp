-- Redenominate monetary units, never reset a customer's spending value.
-- Immutable historic ledgers retain their old denomination in metadata.
BEGIN;
LOCK TABLE "platform_billing_config", "tenant_ai_wallet", "tenant_ai_ledger", "ai_recharge_order" IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE old_rate INTEGER;
BEGIN
  SELECT ai_coins_per_yuan INTO old_rate FROM platform_billing_config LIMIT 1;
  IF old_rate IS NOT NULL AND old_rate <> 10000 THEN
    IF old_rate <= 0 THEN RAISE EXCEPTION 'Invalid legacy AI coin denomination'; END IF;
    UPDATE tenant_ai_ledger SET meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('originalAiCoinsPerYuan', old_rate);
    INSERT INTO tenant_ai_ledger (id, tenant_id, wallet_id, type, direction, coins, balance_after, idempotency_key, remark, meta, created_at)
      SELECT 'denom_20261104_' || id, tenant_id, id, 'denomination_conversion', 'in', 0,
        ceil(balance_coins::numeric * 10000 / old_rate)::integer,
        'denomination_10000:' || id, 'AI币面值等值换算（消费金额保持，尾差向用户取整）',
        jsonb_build_object('oldRate', old_rate, 'newRate', 10000, 'oldBalanceCoins', balance_coins,
          'oldTotalCredited', total_credited, 'oldTotalDebited', total_debited, 'aiCoinsPerYuan', 10000), now()
      FROM tenant_ai_wallet;
    UPDATE tenant_ai_wallet SET
      balance_coins = ceil(balance_coins::numeric * 10000 / old_rate)::integer,
      total_credited = ceil(total_credited::numeric * 10000 / old_rate)::integer,
      total_debited = ceil(total_debited::numeric * 10000 / old_rate)::integer,
      updated_at = now();
    -- Any unconfirmed order can still be settled; already-confirmed history stays untouched.
    UPDATE ai_recharge_order SET ai_coins = floor(amount_yuan * 10000)::integer, updated_at = now() WHERE status <> 'confirmed';
    UPDATE platform_billing_config SET ai_coins_per_yuan = 10000, updated_at = now();
  END IF;
END $$;
ALTER TABLE platform_billing_config ADD COLUMN "system_price_catalog" JSONB;
ALTER TABLE platform_billing_config ALTER COLUMN ai_coins_per_yuan SET DEFAULT 10000;
COMMIT;
