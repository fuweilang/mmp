CREATE TABLE "sms_verification_code" (
    "id" TEXT NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "scene" VARCHAR(32) NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(16) NOT NULL DEFAULT 'mock',
    "send_ip" VARCHAR(80) NOT NULL DEFAULT '',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_verification_code_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sms_verification_code_phone_scene_created_at_idx" ON "sms_verification_code"("phone", "scene", "created_at");
CREATE INDEX "sms_verification_code_expires_at_idx" ON "sms_verification_code"("expires_at");
