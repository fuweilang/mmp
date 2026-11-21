CREATE TABLE "membership_checkout" (
    "id" TEXT NOT NULL,
    "out_trade_no" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan" "MembershipPlan" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "code_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_checkout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "membership_checkout_out_trade_no_key" ON "membership_checkout"("out_trade_no");

CREATE INDEX "membership_checkout_tenant_id_created_at_idx" ON "membership_checkout"("tenant_id", "created_at");

ALTER TABLE "membership_checkout" ADD CONSTRAINT "membership_checkout_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
