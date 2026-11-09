#!/usr/bin/env node
/**
 * 本地务实导入：仓内 assets → 草稿；可选 publish + 华为 grant。
 * 用法：
 *   node scripts/import-official-agent-assets.mjs
 *   node scripts/import-official-agent-assets.mjs --publish-batch-a --grant-huawei
 *   node scripts/import-official-agent-assets.mjs --publish-batch-b --grant-huawei   # 批次 B 9 个内容向
 *   node scripts/import-official-agent-assets.mjs --publish-batch-c                 # 批次 C 6 个官方KB；全员可聊无需 grant
 *   node scripts/import-official-agent-assets.mjs --publish-batch-d                 # 批次 D data/spy/boss；全员可聊
 * --managed-v1：仅管理资产v1新增草稿；任何同key均保留，禁publish/grant；--result=NAME.json记录幂等重跑。
 * 普通无publish导入也不覆盖任何现有草稿/知识库；不 git commit。
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');
const require = createRequire(join(backendRoot, 'package.json'));

// Load env
for (const name of ['.env', '.env.local']) {
  const p = join(backendRoot, name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const { PrismaClient, OfficialAgentKind, OfficialAgentStatus, OfficialAgentGrantStatus, TenantType } =
  require('@prisma/client');
const prisma = new PrismaClient();

const args = new Set(process.argv.slice(2));
const publishBatches = new Set();
if (args.has('--publish-batch-a')) publishBatches.add('A');
if (args.has('--publish-batch-b')) publishBatches.add('B');
if (args.has('--publish-batch-c')) publishBatches.add('C');
if (args.has('--publish-batch-d')) publishBatches.add('D');
const publishBatchA = publishBatches.size > 0;
const grantHuawei = args.has('--grant-huawei');
const keysFilter = [...args].filter((a) => !a.startsWith('--'));

function assetsRoot() {
  const candidates = [
    join(backendRoot, 'src/official-agent/assets'),
    join(backendRoot, 'dist/official-agent/assets'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'agents'))) return dir;
  }
  throw new Error('assets dir not found');
}

function loadAssets() {
  // Same normalizer/asset loader as Admin, using the locally emitted Backend resources.
  const { loadOfficialAgentAssets } = require('./dist/official-agent/official-agent-assets.js');
  return loadOfficialAgentAssets(keysFilter.length ? keysFilter : undefined)
    .filter(asset => !args.has('--managed-v1') || asset.batch === 'external-v1');
}

async function platformAdminId() {
  const admin = await prisma.user.findFirst({
    where: { isPlatformAdmin: true, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) throw new Error('no platform admin');
  return admin.id;
}

const importResults = [];
async function upsertDraft(asset) {
  const existing = await prisma.officialAgent.findUnique({ where: { key: asset.key } });
  if (existing) {
    console.log('preserved existing', asset.key, existing.status);
    importResults.push({ key: asset.key, name: asset.name, id: existing.id, action: 'skipped', reason: 'same key preserved; no overwrite' });
    return existing;
  }
  const created = await prisma.$transaction(async tx => {
    const skills = asset.linkedSkillKeys.length ? await tx.officialSkill.findMany({ where: { key: { in: asset.linkedSkillKeys }, enabledAt: { not: null }, currentRevision: { gt: 0 } }, select: { id: true, key: true } }) : [];
    if (skills.length !== asset.linkedSkillKeys.length) throw new Error('Missing/disabled skill dependency: ' + asset.key);
    const row = await tx.officialAgent.create({ data: {
      key: asset.key, kind: asset.kind, name: asset.name, summary: asset.summary,
      openingQuestions: asset.openingQuestions, systemPrompt: asset.systemPrompt, toolScope: asset.toolScope,
      ...(asset.category ? { category: asset.category } : {}), capabilities: asset.capabilities ?? [], expertDefinition: asset.expertDefinition,
      status: OfficialAgentStatus.DRAFT,
    } });
    if (skills.length) await tx.officialAgentSkillLink.createMany({ data: skills.map(skill => ({ agentId: row.id, skillId: skill.id })) });
    return row;
  });
  importResults.push({ key: asset.key, name: asset.name, id: created.id, action: 'created', status: created.status, reusedSkillKeys: asset.linkedSkillKeys, newSkills: 0 });
  console.log('created draft', asset.key, created.id);
  return created;
}

async function linkedSkillSnapshot(tx, agentId) {
  const { legacySkillCategory } = require('./dist/official-skill/skill-package.js');
  const links = await tx.officialAgentSkillLink.findMany({ where: { agentId }, include: { skill: true }, orderBy: { createdAt: 'asc' } });
  return links.filter(({skill}) => skill.enabledAt && skill.currentRevision > 0).map(({skill}) => ({id:skill.id,key:skill.key,name:skill.name,summary:skill.summary,category:legacySkillCategory(skill.categories?.[0] ?? null),packageRevision:skill.currentRevision,enabledAt:skill.enabledAt.toISOString()}));
}

async function publish(agent, actorUserId) {
  if (agent.status === OfficialAgentStatus.PUBLISHED && agent.onlineVersionId) {
    console.log('already published', agent.key, agent.onlineVersionId);
    return prisma.officialAgent.findUniqueOrThrow({
      where: { id: agent.id },
      include: { onlineVersion: true, versions: { orderBy: { version: 'desc' } } },
    });
  }
  return prisma.$transaction(async (tx) => {
    const latest = await tx.officialAgentVersion.findFirst({
      where: { agentId: agent.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const row = await tx.officialAgent.findUniqueOrThrow({ where: { id: agent.id } });
    const published = await tx.officialAgentVersion.create({
      data: {
        agentId: agent.id,
        version: (latest?.version ?? 0) + 1,
        name: row.name,
        summary: row.summary,
        openingQuestions: row.openingQuestions,
        systemPrompt: row.systemPrompt,
        toolScope: row.toolScope,
        expertDefinition: require('./dist/official-agent/expert-definition.js').normalizeExpertDefinition(row.expertDefinition, row),
        linkedSkillSummaries: await linkedSkillSnapshot(tx, row.id),
        publishedByUserId: actorUserId,
      },
    });
    const updated = await tx.officialAgent.update({
      where: { id: agent.id },
      data: {
        status: OfficialAgentStatus.PUBLISHED,
        onlineVersion: { connect: { id: published.id } },
      },
      include: { onlineVersion: true, versions: { orderBy: { version: 'desc' } } },
    });
    await tx.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'admin_publish_official_agent',
        meta: { agentId: agent.id, versionId: published.id, version: published.version, via: 'import-script' },
      },
    });
    console.log('published', agent.key, 'v' + published.version, published.id);
    return updated;
  });
}

function sanitizeText(input) {
  return String(input || '')
    .replace(/\u0000/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '\uFFFD')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

async function syncOfficialKb(agent, asset, versionId) {
  if (!asset.kbFiles?.length) return;
  const { mkdirSync, writeFileSync, readFileSync: rf, existsSync: ex } = require('node:fs');
  const { dirname: dirnameOf } = require('node:path');
  const uploadRoot = process.env.UPLOAD_DIR || join(backendRoot, 'uploads');
  for (const file of asset.kbFiles) {
    const absAsset = join(assetsRoot(), file.sourcePath);
    if (!ex(absAsset)) throw new Error('missing kb asset ' + file.sourcePath);
    const content = sanitizeText(rf(absAsset, 'utf8'));
    const buffer = Buffer.from(content, 'utf8');
    const existing = await prisma.officialKbDocument.findUnique({
      where: { agentId_assetKey: { agentId: agent.id, assetKey: file.assetKey } },
    });
    const rel = join('official', agent.id, `${file.assetKey.replace(/[^\w.-]+/g, '_')}-${Date.now()}.md`);
    const abs = join(uploadRoot, rel);
    mkdirSync(dirnameOf(abs), { recursive: true });
    writeFileSync(abs, buffer);
    let docId;
    if (existing) {
      await prisma.officialKbChunk.deleteMany({ where: { documentId: existing.id } });
      await prisma.officialKbDocument.update({
        where: { id: existing.id },
        data: {
          versionId: versionId || existing.versionId,
          name: file.name,
          originalName: file.originalName,
          mimeType: 'text/markdown',
          sizeBytes: buffer.length,
          storagePath: rel.replace(/\\/g, '/'),
          status: 'PENDING',
          indexError: null,
        },
      });
      docId = existing.id;
    } else {
      const created = await prisma.officialKbDocument.create({
        data: {
          agentId: agent.id,
          versionId: versionId || null,
          assetKey: file.assetKey,
          name: file.name,
          originalName: file.originalName,
          mimeType: 'text/markdown',
          sizeBytes: buffer.length,
          storagePath: rel.replace(/\\/g, '/'),
          status: 'PENDING',
        },
      });
      docId = created.id;
    }
    // simple chunk without dist dependency
    const normalized = content.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const chunks = [];
    const size = 800, overlap = 80;
    let start = 0;
    while (start < normalized.length) {
      const end = Math.min(normalized.length, start + size);
      const slice = normalized.slice(start, end).trim();
      if (slice) chunks.push(slice);
      if (end >= normalized.length) break;
      start = Math.max(end - overlap, start + 1);
    }
    if (!chunks.length) throw new Error('empty kb ' + file.assetKey);
    await prisma.officialKbChunk.createMany({
      data: chunks.map((c, ordinal) => ({ agentId: agent.id, documentId: docId, ordinal, content: sanitizeText(c) })),
    });
    await prisma.officialKbDocument.update({
      where: { id: docId },
      data: { status: 'READY', indexError: null },
    });
    console.log('synced kb', agent.key, file.assetKey, 'chunks', chunks.length, 'doc', docId);
  }
}

async function grantHuaweiTenant(agent, actorUserId) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: '华为' } });
  if (!tenant || tenant.type !== TenantType.ENTERPRISE) throw new Error('华为 tenant missing');
  const versionId = agent.onlineVersionId;
  if (!versionId) throw new Error('agent has no online version: ' + agent.key);
  await prisma.officialAgentTenantGrant.upsert({
    where: { agentId_tenantId: { agentId: agent.id, tenantId: tenant.id } },
    update: {
      versionId,
      status: OfficialAgentGrantStatus.ACTIVE,
      grantedByUserId: actorUserId,
      revokedAt: null,
    },
    create: {
      agentId: agent.id,
      tenantId: tenant.id,
      versionId,
      grantedByUserId: actorUserId,
    },
  });
  console.log('granted huawei', agent.key, versionId, 'tenant', tenant.id);
}

async function main() {
  if (args.has('--managed-v1') && (publishBatches.size || grantHuawei)) throw new Error('Managed external imports are draft-only; no publish/grant flags allowed');
  const assets = loadAssets();
  if (assets.some(a => a.batch === 'external-v1') && publishBatches.has('external-v1')) throw new Error('External experts require explicit Admin publication review');
  if (!assets.length) throw new Error('no assets loaded');
  const actorUserId = await platformAdminId();
  const batchA = [];
  for (const asset of assets) {
    const draft = await upsertDraft(asset);
    if (importResults.at(-1)?.action === 'skipped' && !publishBatchA) continue;
    if (publishBatchA && publishBatches.has(asset.batch) && asset.publish) {
      const published = await publish(draft, actorUserId);
      await syncOfficialKb(published, asset, published.onlineVersionId);
      batchA.push(published);
      if (grantHuawei) await grantHuaweiTenant(published, actorUserId);
    } else if (asset.kbFiles?.length) {
      // draft-only import still materializes official KB for later publish
      await syncOfficialKb(draft, asset, draft.onlineVersionId);
    }
  }
  // sanity: existing pilots untouched
  const keep = await prisma.officialAgent.findMany({
    where: { key: { in: ['copy-polish-master', 'enterprise-product-answer'] } },
    select: { key: true, status: true, onlineVersionId: true },
  });
  console.log('keep existing', JSON.stringify(keep));
  if (args.has('--managed-v1')) {
    const { writeFileSync } = require('node:fs');
    const output = [...args].find(arg => arg.startsWith('--result='))?.slice(9) || 'IMPORT-RESULT.json';
    if (!/^[a-zA-Z0-9_-]+\.json$/.test(output)) throw new Error('Result filename must be a plain JSON basename');
    const path = join(assetsRoot(), 'managed/v1', output);
    const total = await prisma.officialAgent.count();
    const drafts = await prisma.officialAgent.count({ where: { status: OfficialAgentStatus.DRAFT } });
    writeFileSync(path, JSON.stringify({ mode: 'draft-only', results: importResults, created: importResults.filter(x => x.action === 'created').length, skipped: importResults.filter(x => x.action === 'skipped').length, totalExperts: total, totalDrafts: drafts, skillTotal: await prisma.officialSkill.count(), enabledSkills: await prisma.officialSkill.count({ where: { enabledAt: { not: null } } }), newSkills: 0, publish: false }, null, 2) + '\n');
    console.log('managed result', path);
  }
  console.log('done', { publishBatchA, grantHuawei, batchA: batchA.map((a) => ({ key: a.key, id: a.id, versionId: a.onlineVersionId })) });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
