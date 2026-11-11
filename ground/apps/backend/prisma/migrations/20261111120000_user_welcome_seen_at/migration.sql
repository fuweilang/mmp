-- AlterTable
ALTER TABLE "user" ADD COLUMN "welcome_seen_at" TIMESTAMP(3);

-- Accounts that already exist have passed first-run welcome.
UPDATE "user" SET "welcome_seen_at" = "created_at" WHERE "welcome_seen_at" IS NULL;
