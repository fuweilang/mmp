-- CreateEnum
CREATE TYPE "AccessScope" AS ENUM ('ALL', 'SELECTED');

-- CreateEnum
CREATE TYPE "KbStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "agent_ref" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "persona" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "visibility" "AccessScope" NOT NULL DEFAULT 'ALL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_ref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_grant" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "agent_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_folder" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kb_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_document" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "folder_id" TEXT,
    "name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "status" "KbStatus" NOT NULL DEFAULT 'PENDING',
    "visibility" "AccessScope" NOT NULL DEFAULT 'ALL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kb_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_grant" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "kb_grant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_ref_tenant_id_idx" ON "agent_ref"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_grant_agent_id_user_id_key" ON "agent_grant"("agent_id", "user_id");

-- CreateIndex
CREATE INDEX "agent_grant_user_id_idx" ON "agent_grant"("user_id");

-- CreateIndex
CREATE INDEX "kb_folder_tenant_id_idx" ON "kb_folder"("tenant_id");

-- CreateIndex
CREATE INDEX "kb_document_tenant_id_idx" ON "kb_document"("tenant_id");

-- CreateIndex
CREATE INDEX "kb_document_folder_id_idx" ON "kb_document"("folder_id");

-- CreateIndex
CREATE UNIQUE INDEX "kb_grant_document_id_user_id_key" ON "kb_grant"("document_id", "user_id");

-- CreateIndex
CREATE INDEX "kb_grant_user_id_idx" ON "kb_grant"("user_id");

-- AddForeignKey
ALTER TABLE "agent_ref" ADD CONSTRAINT "agent_ref_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_grant" ADD CONSTRAINT "agent_grant_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent_ref"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_grant" ADD CONSTRAINT "agent_grant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_folder" ADD CONSTRAINT "kb_folder_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_document" ADD CONSTRAINT "kb_document_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_document" ADD CONSTRAINT "kb_document_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "kb_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_grant" ADD CONSTRAINT "kb_grant_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "kb_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_grant" ADD CONSTRAINT "kb_grant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
