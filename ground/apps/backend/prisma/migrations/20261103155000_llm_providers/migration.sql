-- CreateTable
CREATE TABLE "llm_provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'openai_compatible',
    "base_url" TEXT,
    "api_key_enc" TEXT,
    "api_key_hint" TEXT,
    "note" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_model" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_provider_name_key" ON "llm_provider"("name");

-- CreateIndex
CREATE INDEX "llm_provider_enabled_sort_order_idx" ON "llm_provider"("enabled", "sort_order");

-- CreateIndex
CREATE INDEX "llm_model_enabled_sort_order_idx" ON "llm_model"("enabled", "sort_order");

-- CreateIndex
CREATE INDEX "llm_model_is_preferred_idx" ON "llm_model"("is_preferred");

-- CreateIndex
CREATE UNIQUE INDEX "llm_model_provider_id_model_id_key" ON "llm_model"("provider_id", "model_id");

-- AddForeignKey
ALTER TABLE "llm_model" ADD CONSTRAINT "llm_model_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "llm_provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
