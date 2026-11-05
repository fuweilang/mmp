-- AlterTable: 新企业开户赠送金额（元）；0 = 不赠送
ALTER TABLE "platform_billing_config" ADD COLUMN IF NOT EXISTS "welcome_gift_yuan" DECIMAL(12,2) NOT NULL DEFAULT 5;
