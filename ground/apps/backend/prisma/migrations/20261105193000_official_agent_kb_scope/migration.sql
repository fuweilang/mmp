-- 企业为资料型官方智能体配置可检索目录；空数组严格表示不查库。
ALTER TABLE "official_agent_tenant_grant"
ADD COLUMN "kb_folder_ids" JSONB NOT NULL DEFAULT '[]';
