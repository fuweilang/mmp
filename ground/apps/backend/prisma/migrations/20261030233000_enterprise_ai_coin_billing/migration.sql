-- CreateTable
CREATE TABLE "platform_billing_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "sell_price_multiplier" DECIMAL(12,4) NOT NULL DEFAULT 1.5,
    "tokens_per_ai_coin" INTEGER NOT NULL DEFAULT 1000,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "platform_billing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_ai_wallet" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "balance_coins" INTEGER NOT NULL DEFAULT 0,
    "total_credited" INTEGER NOT NULL DEFAULT 0,
    "total_debited" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_ai_wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_ai_ledger" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "tokens" INTEGER,
    "sell_price_multiplier" DECIMAL(12,4),
    "tokens_per_ai_coin" INTEGER,
    "idempotency_key" TEXT NOT NULL,
    "remark" TEXT,
    "operator_user_id" TEXT,
    "actor_user_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_ai_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_ai_wallet_tenant_id_key" ON "tenant_ai_wallet"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_ai_ledger_idempotency_key_key" ON "tenant_ai_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "tenant_ai_ledger_tenant_id_created_at_idx" ON "tenant_ai_ledger"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "tenant_ai_ledger_type_created_at_idx" ON "tenant_ai_ledger"("type", "created_at");

-- AddForeignKey
ALTER TABLE "tenant_ai_wallet" ADD CONSTRAINT "tenant_ai_wallet_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_ai_ledger" ADD CONSTRAINT "tenant_ai_ledger_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "tenant_ai_wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default config + wallets for existing non-platform tenants
INSERT INTO "platform_billing_config" ("id", "sell_price_multiplier", "tokens_per_ai_coin", "updated_at")
VALUES ('default', 1.5, 1000, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "tenant_ai_wallet" ("id", "tenant_id", "balance_coins", "total_credited", "total_debited", "status", "created_at", "updated_at")
SELECT md5(random()::text || clock_timestamp()::text), t."id", 0, 0, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenant" t
WHERE t."type" <> 'PLATFORM'
  AND NOT EXISTS (SELECT 1 FROM "tenant_ai_wallet" w WHERE w."tenant_id" = t."id");
