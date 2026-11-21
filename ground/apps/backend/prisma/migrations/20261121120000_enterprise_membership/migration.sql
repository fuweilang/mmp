-- Enterprise membership: plan on the tenant, minimum plan on each official expert.
-- Existing tenants stay standard with no expiry. Existing experts default to flagship.
CREATE TYPE "MembershipPlan" AS ENUM ('standard', 'pro', 'flagship');

ALTER TABLE "tenant" ADD COLUMN "membership_plan" "MembershipPlan" NOT NULL DEFAULT 'standard';
ALTER TABLE "tenant" ADD COLUMN "membership_expires_at" TIMESTAMP(3);

ALTER TABLE "official_agent" ADD COLUMN "min_plan" "MembershipPlan" NOT NULL DEFAULT 'flagship';

CREATE TABLE "membership_order" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan" "MembershipPlan" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_trade_no" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "membership_order_provider_trade_no_key" ON "membership_order"("provider_trade_no");
CREATE INDEX "membership_order_tenant_id_paid_at_idx" ON "membership_order"("tenant_id", "paid_at");

ALTER TABLE "membership_order" ADD CONSTRAINT "membership_order_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
