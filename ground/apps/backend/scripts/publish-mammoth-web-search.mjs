/**
 * 任务 7：猛犸 AI 草稿写入 web_search → 发新版 → 显式升级华为 grant（不漂移其它企业）。
 * Usage: node scripts/publish-mammoth-web-search.mjs
 */
import { PrismaClient, OfficialAgentGrantStatus, OfficialAgentStatus, TenantType } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(__dirname, '../.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const prisma = new PrismaClient();
const TOOL = 'web_search';

const admin = await prisma.user.findFirst({ where: { isPlatformAdmin: true }, orderBy: { createdAt: 'asc' } });
if (!admin) throw new Error('no platform admin');
const agent = await prisma.officialAgent.findUnique({ where: { key: 'mammoth' } });
if (!agent) throw new Error('mammoth missing');
const huawei = await prisma.tenant.findFirst({ where: { slug: '华为', type: TenantType.ENTERPRISE } });
if (!huawei) throw new Error('huawei tenant missing');

const previousGrant = await prisma.officialAgentTenantGrant.findUnique({
  where: { agentId_tenantId: { agentId: agent.id, tenantId: huawei.id } },
});

await prisma.officialAgent.update({
  where: { id: agent.id },
  data: { toolScope: [TOOL] },
});

const published = await prisma.$transaction(async (tx) => {
  const latest = await tx.officialAgentVersion.findFirst({
    where: { agentId: agent.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const row = await tx.officialAgent.findUniqueOrThrow({ where: { id: agent.id } });
  const version = await tx.officialAgentVersion.create({
    data: {
      agentId: agent.id,
      version: (latest?.version ?? 0) + 1,
      name: row.name,
      summary: row.summary,
      openingQuestions: row.openingQuestions,
      systemPrompt: row.systemPrompt,
      toolScope: [TOOL],
      publishedByUserId: admin.id,
    },
  });
  await tx.officialAgent.update({
    where: { id: agent.id },
    data: {
      status: OfficialAgentStatus.PUBLISHED,
      onlineVersion: { connect: { id: version.id } },
    },
  });
  await tx.auditLog.create({
    data: {
      userId: admin.id,
      action: 'admin_publish_official_agent',
      meta: { agentId: agent.id, versionId: version.id, version: version.version, via: 'publish-mammoth-web-search' },
    },
  });
  return version;
});

await prisma.officialAgentTenantGrant.upsert({
  where: { agentId_tenantId: { agentId: agent.id, tenantId: huawei.id } },
  update: {
    versionId: published.id,
    status: OfficialAgentGrantStatus.ACTIVE,
    grantedByUserId: admin.id,
    revokedAt: null,
  },
  create: {
    agentId: agent.id,
    tenantId: huawei.id,
    versionId: published.id,
    grantedByUserId: admin.id,
  },
});
await prisma.auditLog.create({
  data: {
    userId: admin.id,
    tenantId: huawei.id,
    action: 'admin_grant_official_agent',
    meta: {
      agentId: agent.id,
      previousVersionId: previousGrant?.versionId ?? null,
      versionId: published.id,
      version: published.version,
      via: 'publish-mammoth-web-search',
      explicitUpgrade: true,
    },
  },
});

console.log(JSON.stringify({
  agentId: agent.id,
  key: 'mammoth',
  previousHuaweiVersionId: previousGrant?.versionId ?? null,
  newVersionId: published.id,
  newVersion: published.version,
  toolScope: [TOOL],
  huaweiTenantId: huawei.id,
}, null, 2));

await prisma.$disconnect();
