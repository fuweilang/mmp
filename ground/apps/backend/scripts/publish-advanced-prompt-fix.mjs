/**
 * 复核修复：更新 data/boss 草稿提示词并发布新版本（不静默覆盖已发布冻结版本）。
 * Usage: node scripts/publish-advanced-prompt-fix.mjs
 */
import { PrismaClient, OfficialAgentStatus } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
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
const root = join(__dirname, '../src/official-agent/assets');
const targets = [
  { key: 'data', prompt: 'prompts/data.md', toolScope: ['tabular_analyze'] },
  { key: 'boss', prompt: 'prompts/boss.md', toolScope: ['delegate_official_agent'] },
];

const admin = await prisma.user.findFirst({ where: { isPlatformAdmin: true }, orderBy: { createdAt: 'asc' } });
if (!admin) throw new Error('no platform admin');

const out = [];
for (const t of targets) {
  const promptPath = join(root, t.prompt);
  if (!existsSync(promptPath)) throw new Error(`missing ${promptPath}`);
  const systemPrompt = readFileSync(promptPath, 'utf8').trim();
  const agent = await prisma.officialAgent.findUnique({ where: { key: t.key } });
  if (!agent) throw new Error(`missing agent ${t.key}`);
  await prisma.officialAgent.update({
    where: { id: agent.id },
    data: { systemPrompt, toolScope: t.toolScope },
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
        toolScope: t.toolScope,
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
        meta: {
          agentId: agent.id,
          versionId: version.id,
          version: version.version,
          via: 'publish-advanced-prompt-fix',
          previousOnlineVersionId: agent.onlineVersionId,
        },
      },
    });
    return version;
  });
  out.push({
    key: t.key,
    previousOnlineVersionId: agent.onlineVersionId,
    newVersionId: published.id,
    newVersion: published.version,
  });
}

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
