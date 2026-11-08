-- CreateEnum
CREATE TYPE "OfficialAgentKind" AS ENUM ('GENERAL', 'KNOWLEDGE');

-- CreateEnum
CREATE TYPE "OfficialAgentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'OFFLINE');

-- CreateEnum
CREATE TYPE "OfficialAgentGrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "official_agent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "OfficialAgentKind" NOT NULL,
    "status" "OfficialAgentStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "opening_questions" JSONB NOT NULL DEFAULT '[]',
    "system_prompt" TEXT NOT NULL DEFAULT '',
    "tool_scope" JSONB NOT NULL DEFAULT '[]',
    "online_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_agent_version" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "opening_questions" JSONB NOT NULL DEFAULT '[]',
    "system_prompt" TEXT NOT NULL DEFAULT '',
    "tool_scope" JSONB NOT NULL DEFAULT '[]',
    "published_by_user_id" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "official_agent_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_agent_tenant_grant" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "status" "OfficialAgentGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "granted_by_user_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_agent_tenant_grant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "official_agent_key_key" ON "official_agent"("key");

-- CreateIndex
CREATE UNIQUE INDEX "official_agent_online_version_id_key" ON "official_agent"("online_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "official_agent_version_agent_id_version_key" ON "official_agent_version"("agent_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "official_agent_tenant_grant_agent_id_tenant_id_key" ON "official_agent_tenant_grant"("agent_id", "tenant_id");

-- CreateIndex
CREATE INDEX "official_agent_tenant_grant_tenant_id_status_idx" ON "official_agent_tenant_grant"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "official_agent" ADD CONSTRAINT "official_agent_online_version_id_fkey" FOREIGN KEY ("online_version_id") REFERENCES "official_agent_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_agent_version" ADD CONSTRAINT "official_agent_version_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "official_agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_agent_tenant_grant" ADD CONSTRAINT "official_agent_tenant_grant_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "official_agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_agent_tenant_grant" ADD CONSTRAINT "official_agent_tenant_grant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_agent_tenant_grant" ADD CONSTRAINT "official_agent_tenant_grant_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "official_agent_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;
