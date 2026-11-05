#!/usr/bin/env node
/**
 * DRY-RUN ONLY: list recent token_usage_turn rows that may lack a matching
 * chat_consume ledger (heuristic: same actor + tokens + day). Does NOT debit.
 *
 * Usage (local):
 *   node apps/backend/scripts/dry-run-missing-chat-consume.mjs [--days 7] [--limit 50]
 */
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const daysIdx = args.indexOf('--days');
const limitIdx = args.indexOf('--limit');
const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) || 7 : 7;
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) || 50 : 50;

const prisma = new PrismaClient();
const since = new Date(Date.now() - days * 86400000);

const turns = await prisma.tokenUsageTurn.findMany({
  where: { createdAt: { gte: since } },
  orderBy: { createdAt: 'desc' },
  take: Math.min(Math.max(limit, 1), 500),
});

const orphans = [];
for (const t of turns) {
  if (!t.tenantId || !t.totalTokens) continue;
  const dayStart = new Date(t.createdAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const hit = await prisma.tenantAiLedger.findFirst({
    where: {
      tenantId: t.tenantId,
      type: 'chat_consume',
      tokens: t.totalTokens,
      actorUserId: t.userId,
      createdAt: { gte: dayStart, lt: dayEnd },
    },
    select: { id: true },
  });
  if (!hit) {
    orphans.push({
      id: t.id,
      tenantId: t.tenantId,
      userId: t.userId,
      model: t.model,
      totalTokens: t.totalTokens,
      clientKind: t.clientKind,
      createdAt: t.createdAt.toISOString(),
    });
  }
}

console.log(JSON.stringify({
  dryRun: true,
  since: since.toISOString(),
  scanned: turns.length,
  suspectedMissingCharge: orphans.length,
  note: '启发式对账，误报可能；勿对生产默认回补。若需回补请人工审核后用 /api/billing/charge 幂等键逐条补。',
  samples: orphans.slice(0, 30),
}, null, 2));

await prisma.$disconnect();
