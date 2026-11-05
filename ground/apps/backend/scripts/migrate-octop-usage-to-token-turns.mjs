#!/usr/bin/env node
/**
 * 一次性/可幂等：把本机 Octop usage_log 历史迁入 Ground token_usage_turn。
 *
 * 映射：
 *   usage_log.user_id → users.sso_subject = Ground user.id
 *   tenantId = 该用户最早加入的非 PLATFORM org_member；无则 null（Admin 企业统计不计）
 *   idempotencyKey = `octop-usage-log:{usage_log.id}`（重复跑 skipDuplicates）
 *
 * 用法（本地）：
 *   cd ground/apps/backend
 *   node scripts/migrate-octop-usage-to-token-turns.mjs
 *
 * 环境：
 *   DATABASE_URL（默认读 .env）
 *   OCTOP_HOME / OCTOP_SQLITE_PATH（默认 ~/.octop/octop.db）
 *   DRY_RUN=1 只统计不写库
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');

function loadDotEnv() {
  const envPath = join(backendRoot, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function resolveOctopDbPath() {
  const explicit = (process.env.OCTOP_SQLITE_PATH || '').trim();
  if (explicit) return explicit;
  const home = (process.env.OCTOP_HOME || '').trim() || join(homedir(), '.octop');
  return join(home, 'octop.db');
}

loadDotEnv();

const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').toLowerCase());
const dbPath = resolveOctopDbPath();
if (!existsSync(dbPath)) {
  console.error(`找不到 Octop 数据库: ${dbPath}`);
  process.exit(1);
}

const prisma = new PrismaClient();

function idemKey(usageLogId) {
  return `octop-usage-log:${usageLogId}`;
}

async function main() {
  console.log(`[migrate] octop.db=${dbPath}`);
  console.log(`[migrate] dryRun=${DRY_RUN}`);

  const sqlite = new DatabaseSync(dbPath, { readOnly: true });
  let rows;
  try {
    rows = sqlite
      .prepare(
        `
        SELECT
          l.id AS usage_log_id,
          l.ts AS ts,
          l.agent_id AS agent_id,
          l.user_id AS octop_user_id,
          l.thread_id AS thread_id,
          l.model AS model,
          l.input_tokens AS input_tokens,
          l.output_tokens AS output_tokens,
          l.total_tokens AS total_tokens,
          l.model_calls AS model_calls,
          l.source AS source,
          u.sso_subject AS sso_subject,
          u.username AS username
        FROM usage_log l
        JOIN users u ON u.id = l.user_id
        ORDER BY l.id ASC
        `,
      )
      .all();
  } finally {
    sqlite.close();
  }

  console.log(`[migrate] usage_log rows=${rows.length}`);

  const subjects = [
    ...new Set(
      rows
        .map((r) => (r.sso_subject == null || r.sso_subject === '' ? null : String(r.sso_subject)))
        .filter(Boolean),
    ),
  ];

  const users = subjects.length
    ? await prisma.user.findMany({
        where: { id: { in: subjects } },
        select: {
          id: true,
          name: true,
          memberships: {
            select: {
              tenantId: true,
              createdAt: true,
              tenant: { select: { id: true, type: true, name: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  /** userId → earliest non-PLATFORM tenantId or null */
  const tenantByUser = new Map();
  for (const u of users) {
    const ent = u.memberships.find((m) => m.tenant?.type && m.tenant.type !== 'PLATFORM');
    tenantByUser.set(u.id, ent ? ent.tenantId : null);
  }

  const stats = {
    total: rows.length,
    inserted: 0,
    skippedExisting: 0,
    skippedNoSso: 0,
    skippedUserMissing: 0,
    skippedZero: 0,
    withTenant: 0,
    withoutTenant: 0,
  };

  const toCreate = [];
  for (const r of rows) {
    const usageLogId = Number(r.usage_log_id);
    const sso = r.sso_subject == null || r.sso_subject === '' ? null : String(r.sso_subject);
    if (!sso) {
      stats.skippedNoSso += 1;
      continue;
    }
    if (!userMap.has(sso)) {
      stats.skippedUserMissing += 1;
      continue;
    }

    let input = Math.max(0, Math.floor(Number(r.input_tokens) || 0));
    let output = Math.max(0, Math.floor(Number(r.output_tokens) || 0));
    let total = Math.max(0, Math.floor(Number(r.total_tokens) || 0));
    if (total <= 0) total = input + output;
    if (total <= 0 && input <= 0 && output <= 0) {
      stats.skippedZero += 1;
      continue;
    }

    const tenantId = tenantByUser.get(sso) ?? null;
    if (tenantId) stats.withTenant += 1;
    else stats.withoutTenant += 1;

    const tsSec = Number(r.ts) || 0;
    const occurredAt = tsSec > 0 ? new Date(tsSec * 1000) : new Date();
    const modelCalls = Math.max(1, Math.floor(Number(r.model_calls) || 1));

    toCreate.push({
      tenantId,
      userId: sso,
      model: String(r.model || '').slice(0, 128),
      inputTokens: input,
      outputTokens: output,
      totalTokens: total,
      modelCalls,
      threadId: String(r.thread_id || '').slice(0, 128),
      agentId: String(r.agent_id || '').slice(0, 128),
      clientKind: 'unknown',
      source: String(r.source || 'chat').slice(0, 64) || 'chat',
      idempotencyKey: idemKey(usageLogId),
      occurredAt,
      meta: {
        migratedFrom: 'octop_usage_log',
        usageLogId,
        octopUserId: Number(r.octop_user_id) || null,
        octopUsername: r.username == null ? null : String(r.username),
      },
    });
  }

  // 幂等：已存在的 key 跳过
  const keys = toCreate.map((x) => x.idempotencyKey);
  const existing = keys.length
    ? await prisma.tokenUsageTurn.findMany({
        where: { idempotencyKey: { in: keys } },
        select: { idempotencyKey: true },
      })
    : [];
  const existingSet = new Set(existing.map((e) => e.idempotencyKey));
  const fresh = toCreate.filter((x) => {
    if (existingSet.has(x.idempotencyKey)) {
      stats.skippedExisting += 1;
      return false;
    }
    return true;
  });

  if (!DRY_RUN && fresh.length) {
    // createMany + skipDuplicates；分批避免参数过多
    const BATCH = 200;
    for (let i = 0; i < fresh.length; i += BATCH) {
      const chunk = fresh.slice(i, i + BATCH);
      const res = await prisma.tokenUsageTurn.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      stats.inserted += res.count;
    }
  } else if (DRY_RUN) {
    stats.inserted = fresh.length; // would-insert
  } else {
    stats.inserted = 0;
  }

  const remaining = await prisma.tokenUsageTurn.count();
  const enterpriseCount = await prisma.tokenUsageTurn.count({
    where: { tenantId: { not: null }, tenant: { type: { not: 'PLATFORM' } } },
  });

  console.log('[migrate] done', {
    ...stats,
    wouldOrDidInsert: stats.inserted,
    pendingCandidates: fresh.length,
    tokenUsageTurnTotal: remaining,
    tokenUsageTurnWithEnterpriseTenant: enterpriseCount,
  });

  if (enterpriseCount <= 0) {
    console.warn(
      '[migrate] 警告：带企业 tenant 的行为 0。Admin Token 统计仍可能为空（当前 Ground 用户无非 PLATFORM 成员，或可映射行全是平台账号）。',
    );
  } else {
    console.log(`[migrate] Admin Token 统计可读行约 ${enterpriseCount}（tenant 非 PLATFORM）`);
  }
}

main()
  .catch((e) => {
    console.error('[migrate] failed', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
