-- CreateTable
CREATE TABLE "token_usage_turn" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "model_calls" INTEGER NOT NULL DEFAULT 1,
    "thread_id" TEXT NOT NULL DEFAULT '',
    "agent_id" TEXT NOT NULL DEFAULT '',
    "client_kind" TEXT NOT NULL DEFAULT 'unknown',
    "source" TEXT NOT NULL DEFAULT 'chat',
    "idempotency_key" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "token_usage_turn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_usage_turn_idempotency_key_key" ON "token_usage_turn"("idempotency_key");

-- CreateIndex
CREATE INDEX "token_usage_turn_tenant_id_occurred_at_idx" ON "token_usage_turn"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "token_usage_turn_user_id_occurred_at_idx" ON "token_usage_turn"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "token_usage_turn_model_occurred_at_idx" ON "token_usage_turn"("model", "occurred_at");

-- AddForeignKey
ALTER TABLE "token_usage_turn" ADD CONSTRAINT "token_usage_turn_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_usage_turn" ADD CONSTRAINT "token_usage_turn_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
