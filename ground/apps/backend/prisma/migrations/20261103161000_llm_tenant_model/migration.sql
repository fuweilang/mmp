-- CreateTable
CREATE TABLE "llm_tenant_model" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "model_row_id" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_tenant_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_tenant_model_tenant_id_is_default_idx" ON "llm_tenant_model"("tenant_id", "is_default");

-- CreateIndex
CREATE INDEX "llm_tenant_model_model_row_id_idx" ON "llm_tenant_model"("model_row_id");

-- CreateIndex
CREATE UNIQUE INDEX "llm_tenant_model_tenant_id_model_row_id_key" ON "llm_tenant_model"("tenant_id", "model_row_id");

-- AddForeignKey
ALTER TABLE "llm_tenant_model" ADD CONSTRAINT "llm_tenant_model_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_tenant_model" ADD CONSTRAINT "llm_tenant_model_model_row_id_fkey" FOREIGN KEY ("model_row_id") REFERENCES "llm_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;
