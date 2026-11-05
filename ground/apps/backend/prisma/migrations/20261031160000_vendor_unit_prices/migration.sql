-- 上游采购单价 JSON：{ deepseek:{input,output}, kimi:{input,output} } 单位 ¥/1M tokens
ALTER TABLE "platform_billing_config" ADD COLUMN IF NOT EXISTS "vendor_unit_prices" JSONB;
