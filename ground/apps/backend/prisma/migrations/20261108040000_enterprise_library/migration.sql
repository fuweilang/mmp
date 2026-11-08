-- CreateEnum
CREATE TYPE "LibraryScope" AS ENUM ('PRIVATE', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "LibraryKind" AS ENUM ('FILE', 'FOLDER', 'LINK');

-- CreateEnum
CREATE TYPE "LibraryState" AS ENUM ('ACTIVE', 'RECYCLED', 'PURGED');

-- CreateEnum
CREATE TYPE "LibraryParseStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DOWNLOAD_ONLY', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "LibraryCustodyScope" AS ENUM ('ENTERPRISE', 'PRIVATE_OWNER');

-- CreateEnum
CREATE TYPE "LibraryCustodyPower" AS ENUM ('READ', 'CRUD');

-- CreateTable
CREATE TABLE "library_node" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "kind" "LibraryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "LibraryScope" NOT NULL DEFAULT 'PRIVATE',
    "state" "LibraryState" NOT NULL DEFAULT 'ACTIVE',
    "link_url" TEXT,
    "current_version_id" TEXT,
    "recycled_at" TIMESTAMP(3),
    "purged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_version" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "version_no" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "parse_status" "LibraryParseStatus" NOT NULL DEFAULT 'PENDING',
    "parse_reason" TEXT,
    "extract_truncated" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_chunk" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "locator" TEXT NOT NULL,
    "locator_kind" TEXT NOT NULL,

    CONSTRAINT "library_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_recent" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_recent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_custody" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "grantor_user_id" TEXT NOT NULL,
    "grantee_user_id" TEXT NOT NULL,
    "content_scope" "LibraryCustodyScope" NOT NULL,
    "owner_user_id" TEXT,
    "powers" "LibraryCustodyPower" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_custody_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_node_tenant_id_state_scope_idx" ON "library_node"("tenant_id", "state", "scope");

-- CreateIndex
CREATE INDEX "library_node_owner_user_id_idx" ON "library_node"("owner_user_id");

-- CreateIndex
CREATE INDEX "library_node_parent_id_idx" ON "library_node"("parent_id");

-- CreateIndex
CREATE INDEX "library_version_tenant_id_idx" ON "library_version"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_version_node_id_version_no_key" ON "library_version"("node_id", "version_no");

-- CreateIndex
CREATE INDEX "library_chunk_tenant_id_version_id_idx" ON "library_chunk"("tenant_id", "version_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_chunk_version_id_ordinal_key" ON "library_chunk"("version_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "library_recent_user_id_node_id_key" ON "library_recent"("user_id", "node_id");

-- CreateIndex
CREATE INDEX "library_recent_user_id_accessed_at_idx" ON "library_recent"("user_id", "accessed_at");

-- CreateIndex
CREATE INDEX "library_custody_tenant_id_grantee_user_id_idx" ON "library_custody"("tenant_id", "grantee_user_id");

-- AddForeignKey
ALTER TABLE "library_node" ADD CONSTRAINT "library_node_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_node" ADD CONSTRAINT "library_node_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_node" ADD CONSTRAINT "library_node_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "library_node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_version" ADD CONSTRAINT "library_version_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "library_node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_version" ADD CONSTRAINT "library_version_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_version" ADD CONSTRAINT "library_version_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_chunk" ADD CONSTRAINT "library_chunk_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "library_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_chunk" ADD CONSTRAINT "library_chunk_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_recent" ADD CONSTRAINT "library_recent_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_recent" ADD CONSTRAINT "library_recent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_recent" ADD CONSTRAINT "library_recent_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "library_node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_custody" ADD CONSTRAINT "library_custody_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_custody" ADD CONSTRAINT "library_custody_grantor_user_id_fkey" FOREIGN KEY ("grantor_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_custody" ADD CONSTRAINT "library_custody_grantee_user_id_fkey" FOREIGN KEY ("grantee_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
