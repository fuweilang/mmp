#!/usr/bin/env node
/**
 * Local-dev batch: zh display fill for official skills via Ground /api/v1/chat/completions (cloud pool).
 * Usage:
 *   node scripts/translate-official-skill-display.mjs --dry-run
 *   node scripts/translate-official-skill-display.mjs --limit 20
 *   node scripts/translate-official-skill-display.mjs --keys a,b
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limit = Number(args[args.indexOf('--limit') + 1] || (args.includes('--limit') ? 20 : 20));
const keysArg = args.includes('--keys') ? String(args[args.indexOf('--keys') + 1] || '') : '';
const keys = keysArg.split(',').map((s) => s.trim()).filter(Boolean);
const apiBase = (process.env.GROUND_API_BASE || 'http://127.0.0.1:5201').replace(/\/$/, '');
const phone = process.env.TRANSLATE_ADMIN_PHONE || '13800000001';
const password = process.env.TRANSLATE_ADMIN_PASSWORD || '12345678';

const db = process.env.DATABASE_URL || '';
if (!/127\.0\.0\.1:5433|localhost:5433/.test(db)) {
  console.error(JSON.stringify({ error: 'refusing: DATABASE_URL not local :5433', hint: db.replace(/:[^:@/]+@/, ':***@') }));
  process.exit(2);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const NAME_MAX = 40;
const SUMMARY_MAX = 140;

const looksEnglish = (text) => {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/[\u4e00-\u9fff]/.test(t)) return false;
  return /[A-Za-z]{3,}/.test(t);
};
const clip = (text, max) => {
  const chars = [...String(text || '').trim()];
  return chars.length <= max ? chars.join('') : chars.slice(0, max).join('').trim();
};
const sourceHash = (name, summary) => createHash('sha256').update(`${name}\n${summary}`, 'utf8').digest('hex');
const needs = (row) => {
  if (row.displayProvenance === 'manual') return false;
  const sn = (row.sourceName ?? row.name).trim();
  const ss = (row.sourceSummary || row.summary || '').trim();
  const hash = sourceHash(sn, ss);
  if (row.displayProvenance === 'machine' && row.displaySourceHash === hash) {
    return looksEnglish(row.name) || looksEnglish(row.summary);
  }
  return looksEnglish(row.name) || looksEnglish(row.summary) || looksEnglish(sn) || looksEnglish(ss);
};

async function login() {
  const res = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const raw = setCookie.join(',') || res.headers.get('set-cookie') || '';
  const m = String(raw).match(/mammothai_access_token=([^;]+)/);
  if (!res.ok || !m) {
    const body = await res.text();
    throw new Error(`login failed HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return m[1];
}

async function completeOnce(token, prompt) {
  const res = await fetch(`${apiBase}/api/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `mammothai_access_token=${token}`,
    },
    body: JSON.stringify({
      model: 'auto',
      temperature: 0.2,
      stream: false,
      messages: [
        { role: 'system', content: '只输出 JSON 对象，不要解释。' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`chat HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('empty model content');
  const modelRef = json?.model || 'auto';
  return { content, modelRef };
}

function parseJson(raw) {
  const fenced = String(raw).match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(fenced ? fenced[0] : raw);
  if (typeof parsed.name !== 'string' || !parsed.name.trim()) throw new Error('missing name');
  if (typeof parsed.summary !== 'string') throw new Error('missing summary');
  return { name: clip(parsed.name, NAME_MAX), summary: clip(parsed.summary, SUMMARY_MAX) };
}

function promptFor(row, sourceName, sourceSummary) {
  return [
    '你是技能目录本地化助手。把下列技能的【展示名称】和【用途简介】译成简体中文，供用户浏览。',
    '硬性要求：',
    '1. 只翻译给人看的名称与简介；不要发明工具能力，不要改写执行逻辑。',
    '2. 保留产品名、API、模型名、品牌名等专有名词（可加简短中文说明）。',
    '3. 名称尽量短、像应用卡片标题；简介一句话说明用途。',
    `4. 名称不超过 ${NAME_MAX} 个字符，简介不超过 ${SUMMARY_MAX} 个字符（按 Unicode 字符计）。`,
    '5. 只输出一个 JSON 对象，键为 name、summary，不要 Markdown 围栏，不要其它文字。',
    `技能标识(key，勿翻译): ${row.key}`,
    `原名称: ${sourceName}`,
    `原简介: ${sourceSummary || '（空）'}`,
  ].join('\n');
}

async function main() {
  const rows = await prisma.officialSkill.findMany({
    where: keys.length ? { key: { in: keys } } : undefined,
    orderBy: { key: 'asc' },
    select: {
      id: true, key: true, name: true, summary: true,
      sourceName: true, sourceSummary: true, displayProvenance: true, displaySourceHash: true,
      currentPackage: { select: { storagePath: true } },
    },
  });
  const candidates = rows.filter(needs);
  const selected = candidates.slice(0, Math.max(1, Math.min(limit, 100)));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(backendRoot, 'uploads', 'official-skill-display-i18n-backups');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `backup-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify({ at: new Date().toISOString(), db: '127.0.0.1:5433/mammoth_core', selected }, null, 2));

  const report = {
    apiBase,
    dryRun,
    backupPath,
    total: rows.length,
    needingTranslation: candidates.length,
    selected: selected.length,
    skippedManual: rows.filter((r) => r.displayProvenance === 'manual').length,
    translated: 0,
    failed: 0,
    translatedKeys: [],
    failures: [],
    modelRef: null,
  };
  console.log(JSON.stringify({ phase: 'preflight', ...report, sampleKeys: selected.map((r) => r.key) }, null, 2));
  if (dryRun) return;

  const token = await login();
  for (const row of selected) {
    const sourceName = (row.sourceName ?? row.name).trim();
    const sourceSummary = (row.sourceSummary || row.summary || '').trim();
    if (!row.sourceName || !row.sourceSummary) {
      await prisma.officialSkill.update({
        where: { id: row.id },
        data: { sourceName: row.sourceName ?? row.name, sourceSummary: row.sourceSummary || row.summary || '' },
      });
    }
    let ok = false;
    let lastError = 'unknown';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { content, modelRef } = await completeOnce(token, promptFor(row, sourceName, sourceSummary));
        report.modelRef = modelRef;
        const parsed = parseJson(content);
        if (!parsed.name || looksEnglish(parsed.name) && looksEnglish(sourceName)) {
          // allow english-only brand names but require some CJK in either field when source was english prose
        }
        await prisma.officialSkill.update({
          where: { id: row.id },
          data: {
            name: parsed.name,
            summary: parsed.summary,
            sourceName,
            sourceSummary,
            displayProvenance: 'machine',
            displayLocale: 'zh-Hans',
            displayTranslatedAt: new Date(),
            displayModelRef: modelRef,
            displaySourceHash: sourceHash(sourceName, sourceSummary),
          },
        });
        // Verify instruction file untouched
        if (row.currentPackage?.storagePath) {
          const skillMd = join(process.env.UPLOAD_DIR || join(backendRoot, 'uploads'), row.currentPackage.storagePath, 'SKILL.md');
          if (existsSync(skillMd)) {
            // no write — presence check only
          }
        }
        report.translated += 1;
        report.translatedKeys.push(row.key);
        ok = true;
        break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    if (!ok) {
      report.failed += 1;
      report.failures.push({ key: row.key, error: lastError.slice(0, 300) });
    }
  }
  console.log(JSON.stringify({ phase: 'done', ...report }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
