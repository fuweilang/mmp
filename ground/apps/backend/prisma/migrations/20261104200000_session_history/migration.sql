CREATE TABLE "synced_conversation" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "tenant_id" TEXT,
  "tenant_scope" TEXT NOT NULL, "device_id" TEXT NOT NULL, "session_id" TEXT NOT NULL,
  "device_name" TEXT NOT NULL, "client_kind" TEXT NOT NULL, "title" TEXT NOT NULL,
  "project_name" TEXT NOT NULL, "source_created_at" TIMESTAMP(3) NOT NULL,
  "source_updated_at" TIMESTAMP(3) NOT NULL, "source_revision" INTEGER NOT NULL DEFAULT -1,
  "state" TEXT NOT NULL DEFAULT 'idle', "syncing" BOOLEAN NOT NULL DEFAULT true,
  "files" JSONB NOT NULL DEFAULT '[]', "last_synced_at" TIMESTAMP(3),
  "device_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "synced_conversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "synced_conversation_user_id_tenant_scope_device_id_session_id_key"
  ON "synced_conversation"("user_id", "tenant_scope", "device_id", "session_id");
CREATE INDEX "synced_conversation_user_id_tenant_scope_source_updated_at_id_idx"
  ON "synced_conversation"("user_id", "tenant_scope", "source_updated_at", "id");
CREATE TABLE "synced_conversation_message" (
  "id" TEXT NOT NULL, "conversation_id" TEXT NOT NULL, "source_seq" INTEGER NOT NULL,
  "role" TEXT NOT NULL, "text" TEXT NOT NULL, "source_time" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "synced_conversation_message_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "synced_conversation_message_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "synced_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "synced_conversation_message_conversation_id_source_seq_key"
  ON "synced_conversation_message"("conversation_id", "source_seq");
