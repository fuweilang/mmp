-- SMS code hardening: abuse-control index + one live code per phone+scene.
-- 部分唯一索引 Prisma schema 表达不了，手工维护；Prisma 侧只声明普通索引。
CREATE INDEX "sms_verification_code_send_ip_created_at_idx" ON "sms_verification_code"("send_ip", "created_at");

-- 建唯一索引前先把历史并发产生的重复未核销行收口：只保留最新一条，
-- 旧的本来就取不到（findLatest 只取最新），标记为已核销不丢审计数据。
UPDATE "sms_verification_code" AS c
SET "consumed_at" = NOW()
WHERE c."consumed_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "sms_verification_code" AS n
    WHERE n."phone" = c."phone"
      AND n."scene" = c."scene"
      AND n."consumed_at" IS NULL
      AND (n."created_at" > c."created_at" OR (n."created_at" = c."created_at" AND n."id" > c."id"))
  );

-- send()/register() 在发码前把已过期的未核销行标记为已核销，释放该槽位，
-- 因此这里约束的只是「同一手机号同一场景最多一条未核销验证码」。
CREATE UNIQUE INDEX "sms_verification_code_phone_scene_live_key" ON "sms_verification_code"("phone", "scene") WHERE "consumed_at" IS NULL;
