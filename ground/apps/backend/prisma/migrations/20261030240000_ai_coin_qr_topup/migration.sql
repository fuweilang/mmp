-- AlterTable
ALTER TABLE "platform_billing_config" ADD COLUMN IF NOT EXISTS "ai_coins_per_yuan" INTEGER NOT NULL DEFAULT 1000;

-- CreateTable
CREATE TABLE "ai_recharge_order" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_no" TEXT NOT NULL,
    "amount_yuan" DECIMAL(12,2) NOT NULL,
    "ai_coins" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "channel" TEXT NOT NULL DEFAULT '',
    "out_trade_no" TEXT NOT NULL DEFAULT '',
    "code_url" TEXT NOT NULL DEFAULT '',
    "expire_at" TIMESTAMP(3),
    "transaction_id" TEXT NOT NULL DEFAULT '',
    "paid_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" TEXT NOT NULL DEFAULT '',
    "confirm_idempotency_key" TEXT,
    "request_idempotency_key" TEXT,
    "created_by_user_id" TEXT,
    "remark" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_recharge_order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_recharge_order_order_no_key" ON "ai_recharge_order"("order_no");
CREATE UNIQUE INDEX "ai_recharge_order_confirm_idempotency_key_key" ON "ai_recharge_order"("confirm_idempotency_key");
CREATE UNIQUE INDEX "ai_recharge_order_request_idempotency_key_key" ON "ai_recharge_order"("request_idempotency_key");
CREATE INDEX "ai_recharge_order_tenant_id_created_at_idx" ON "ai_recharge_order"("tenant_id", "created_at");
CREATE INDEX "ai_recharge_order_status_created_at_idx" ON "ai_recharge_order"("status", "created_at");
CREATE INDEX "ai_recharge_order_out_trade_no_idx" ON "ai_recharge_order"("out_trade_no");

ALTER TABLE "ai_recharge_order" ADD CONSTRAINT "ai_recharge_order_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
