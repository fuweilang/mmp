-- CreateTable
CREATE TABLE "org_preset_override" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "preset_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_preset_override_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_preset_override_permission" (
    "id" TEXT NOT NULL,
    "override_id" TEXT NOT NULL,
    "perm_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_preset_override_permission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_preset_override_preset_key_idx" ON "org_preset_override"("preset_key");

-- CreateIndex
CREATE UNIQUE INDEX "org_preset_override_tenant_id_preset_key_key" ON "org_preset_override"("tenant_id", "preset_key");

-- CreateIndex
CREATE INDEX "org_preset_override_permission_perm_key_idx" ON "org_preset_override_permission"("perm_key");

-- CreateIndex
CREATE UNIQUE INDEX "org_preset_override_permission_override_id_perm_key_key" ON "org_preset_override_permission"("override_id", "perm_key");

-- AddForeignKey
ALTER TABLE "org_preset_override" ADD CONSTRAINT "org_preset_override_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_preset_override_permission" ADD CONSTRAINT "org_preset_override_permission_override_id_fkey" FOREIGN KEY ("override_id") REFERENCES "org_preset_override"("id") ON DELETE CASCADE ON UPDATE CASCADE;
