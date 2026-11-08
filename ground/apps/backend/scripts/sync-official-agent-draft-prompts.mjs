#!/usr/bin/env node
/**
 * 仅把仓内 assets 的 systemPrompt 同步到 official_agent 草稿字段。
 * 绝不 publish、不改 versions、不改 grants、不改 onlineVersion。
 *
 * 用法：
 *   node scripts/sync-official-agent-draft-prompts.mjs copy gzh
 *   node scripts/sync-official-agent-draft-prompts.mjs --dry-run copy
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');
const require = createRequire(join(backendRoot, 'package.json'));

for (const name of ['.env', '.env.local']) {
  const p = join(backendRoot, name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const keys = argv.filter((a) => !a.startsWith('--'));
if (!keys.length) {
  console.error('usage: node scripts/sync-official-agent-draft-prompts.mjs [--dry-run] <key>...');
  process.exit(2);
}

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

function loadPrompt(key) {
  const root = assetsRoot();
  const file = join(root, 'agents', `${key}.json`);
  if (!existsSync(file)) throw new Error(`missing agent json: ${key}`);
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  let systemPrompt = (raw.systemPrompt || '').trim();
  if (!systemPrompt && raw.promptFile) {
    systemPrompt = readFileSync(join(root, raw.promptFile), 'utf8').trim();
  }
  if (!systemPrompt) throw new Error(`empty prompt: ${key}`);
  return {
    key: raw.key,
    name: raw.name,
    summary: raw.summary || '',
    openingQuestions: [...new Set((raw.openingQuestions || []).map((s) => String(s).trim()).filter(Boolean))],
    toolScope: [...new Set((raw.toolScope || []).map((s) => String(s).trim()).filter(Boolean))],
    systemPrompt,
  };
}

function head(s, n = 80) {
  return String(s || '').replace(/\s+/g, ' ').slice(0, n);
}

async function main() {
  // sanity: assets dir lists expected keys
  const listed = new Set(readdirSync(join(assetsRoot(), 'agents')).filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/, '')));
  for (const key of keys) {
    if (!listed.has(key)) throw new Error(`key not in assets: ${key}`);
    const asset = loadPrompt(key);
    const row = await prisma.officialAgent.findUnique({
      where: { key },
      include: { onlineVersion: true },
    });
    if (!row) throw new Error(`db missing officialAgent key=${key}`);

    const onlineBefore = row.onlineVersion?.systemPrompt ?? null;
    const onlineIdBefore = row.onlineVersionId;
    const draftBefore = row.systemPrompt;

    console.log(JSON.stringify({
      key,
      dryRun,
      status: row.status,
      onlineVersionId: onlineIdBefore,
      onlineVersion: row.onlineVersion?.version ?? null,
      draftLenBefore: (draftBefore || '').length,
      assetLen: asset.systemPrompt.length,
      onlineLenBefore: (onlineBefore || '').length,
      draftAlreadyMatchesAsset: draftBefore === asset.systemPrompt,
      onlineMatchesDraftBefore: draftBefore === onlineBefore,
    }, null, 2));

    if (dryRun) continue;

    await prisma.officialAgent.update({
      where: { id: row.id },
      data: {
        // 仅草稿字段；不碰 status / onlineVersionId / versions
        name: asset.name.trim(),
        summary: (asset.summary || '').trim(),
        openingQuestions: asset.openingQuestions,
        toolScope: asset.toolScope,
        systemPrompt: asset.systemPrompt,
      },
    });

    const after = await prisma.officialAgent.findUnique({
      where: { id: row.id },
      include: { onlineVersion: true },
    });
    const onlineUnchanged =
      after.onlineVersionId === onlineIdBefore &&
      (after.onlineVersion?.systemPrompt ?? null) === onlineBefore;
    if (!onlineUnchanged) {
      throw new Error(`REFUSAL: online version changed for ${key}`);
    }
    console.log(JSON.stringify({
      key,
      synced: true,
      draftLenAfter: (after.systemPrompt || '').length,
      draftMatchesAsset: after.systemPrompt === asset.systemPrompt,
      onlineUnchanged: true,
      draftHead: head(after.systemPrompt),
      onlineHead: head(after.onlineVersion?.systemPrompt),
      draftDiffersFromOnline: after.systemPrompt !== after.onlineVersion?.systemPrompt,
    }, null, 2));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
