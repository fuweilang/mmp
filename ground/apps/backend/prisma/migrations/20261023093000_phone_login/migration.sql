UPDATE "user" SET phone = '13800000001' WHERE email = 'admin@mammoth.local' AND (phone IS NULL OR phone = '');
UPDATE "user" SET phone = '13800000002' WHERE email = 'agency@mammoth.local' AND (phone IS NULL OR phone = '');
UPDATE "user" SET phone = '13800000003' WHERE email = 'demo@mammoth.local' AND (phone IS NULL OR phone = '');
UPDATE "user" SET phone = '199' || substr(id, 1, 8) WHERE phone IS NULL OR phone = '';

ALTER TABLE "user" ALTER COLUMN "phone" SET NOT NULL;
