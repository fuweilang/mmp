#!/usr/bin/env node
/**
 * Lab acceptance for official Agent avatars — no user cookies / no business login.
 * Proves: public Ground portrait HTTP 200, asset JSON remaps resolve, Playwright renders cards.
 */
import { createRequire } from 'module';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/fuweilang/Documents/code/mmp/mammoth-agent/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const ROOT = '/Users/fuweilang/Documents/code/mmp';
const ASSETS = join(ROOT, 'ground/apps/backend/src/official-agent/assets');
const OUT = __dirname;
const GROUND = process.env.GROUND_PUBLIC_ORIGIN || 'http://127.0.0.1:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

mkdirSync(join(OUT, 'shots'), { recursive: true });

const HISTORICAL = {
  ip: 'avatars/growth.jpg',
  gzh: 'avatars/copy.jpg',
  niche: 'avatars/data.jpg',
  sell: 'avatars/live.jpg',
  method: 'avatars/trans.jpg',
  interview: 'avatars/qc.jpg',
};

const summary = {
  time: new Date().toISOString(),
  zone: 'Asia/Shanghai',
  ok: false,
  checks: [],
  coverage: [],
  http: [],
  errors: [],
};

function check(name, pass, detail = null) {
  summary.checks.push({ name, pass: !!pass, detail });
  if (!pass) summary.errors.push({ name, detail });
}

function loadAgents() {
  const dir = join(ASSETS, 'agents');
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8')));
}

function resolveLocal(key, avatar) {
  const candidates = [];
  if (typeof avatar === 'string' && avatar.startsWith('avatars/')) candidates.push(avatar);
  candidates.push(`avatars/${key}.jpg`);
  for (const rel of candidates) {
    const abs = join(ASSETS, ...rel.split('/'));
    if (existsSync(abs)) return { relativePath: rel, fileName: rel.split('/').pop() };
  }
  return null;
}

const agents = loadAgents();
check('asset_agent_count_20', agents.length === 20, agents.length);

for (const [key, expected] of Object.entries(HISTORICAL)) {
  const agent = agents.find((a) => a.key === key);
  check(`historical_json_${key}`, agent?.avatar === expected, agent?.avatar);
}

const coverage = [];
for (const agent of agents) {
  const resolved = resolveLocal(agent.key, agent.avatar);
  const row = {
    key: agent.key,
    name: agent.name,
    avatarField: agent.avatar ?? null,
    resolved: resolved?.relativePath ?? null,
    source: resolved
      ? agent.avatar && resolved.relativePath === agent.avatar
        ? 'explicit'
        : 'same-key'
      : 'glyph-fallback',
  };
  coverage.push(row);
}
summary.coverage = coverage;
const withPortrait = coverage.filter((r) => r.resolved);
const glyph = coverage.filter((r) => !r.resolved);
check('portraits_at_least_18', withPortrait.length >= 18, { withPortrait: withPortrait.length, glyph: glyph.map((g) => g.key) });
check(
  'glyph_only_expected',
  glyph.every((g) => g.key === 'mammoth' || g.key === 'c3274112ed041'),
  glyph.map((g) => g.key),
);

const filesNeeded = [...new Set(withPortrait.map((r) => r.resolved.split('/').pop()))];
for (const file of filesNeeded) {
  const url = `${GROUND}/api/official-agents/avatars/${encodeURIComponent(file)}`;
  const res = await fetch(url);
  const ctype = res.headers.get('content-type') || '';
  const row = { file, url, status: res.status, contentType: ctype };
  summary.http.push(row);
  check(`http_${file}`, res.status === 200 && ctype.includes('image/'), row);
}

// Playwright: render a lab HTML grid using public Ground URLs (no cookies).
const html = `<!doctype html><html><head><meta charset="utf-8"><title>avatar lab</title>
<style>
body{font-family:sans-serif;background:#f5f6f8;margin:24px}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.card{background:#fff;border-radius:12px;padding:12px;display:flex;gap:12px;align-items:center;box-shadow:0 0 0 1px #e5e7eb}
img{width:44px;height:44px;border-radius:50%;object-fit:cover;background:#eee}
.glyph{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:#e8eef8;font-weight:600}
.meta{font-size:13px;line-height:1.4}.meta b{display:block;font-size:14px}
</style></head><body>
<h1>Official agent avatars (lab)</h1>
<div class="grid" id="grid"></div>
<script>
const rows = ${JSON.stringify(coverage.map((r) => ({
  ...r,
  url: r.resolved ? `${GROUND}/api/official-agents/avatars/${r.resolved.split('/').pop()}` : null,
})))};
const grid = document.getElementById('grid');
for (const row of rows) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.key = row.key;
  if (row.url) {
    const img = document.createElement('img');
    img.src = row.url;
    img.alt = row.name;
    img.dataset.key = row.key;
    card.appendChild(img);
  } else {
    const g = document.createElement('div');
    g.className = 'glyph';
    g.textContent = (row.name || '?').slice(0, 1);
    card.appendChild(g);
  }
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = '<b>' + row.name + '</b>' + row.key + '<br>' + (row.source + (row.resolved ? ' · ' + row.resolved : ''));
  card.appendChild(meta);
  grid.appendChild(card);
}
</script></body></html>`;
const htmlPath = join(OUT, 'lab.html');
writeFileSync(htmlPath, html);

const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
// wait for images
await page.waitForTimeout(1500);
const imgStates = await page.$$eval('img', (imgs) =>
  imgs.map((img) => ({
    key: img.dataset.key,
    src: img.currentSrc || img.src,
    naturalWidth: img.naturalWidth,
    complete: img.complete,
  })),
);
summary.browserImages = imgStates;
const loaded = imgStates.filter((i) => i.naturalWidth > 0);
check('playwright_images_loaded', loaded.length === withPortrait.length, {
  loaded: loaded.length,
  expected: withPortrait.length,
  failed: imgStates.filter((i) => i.naturalWidth === 0).map((i) => i.key),
});
await page.screenshot({ path: join(OUT, 'shots/01-avatars-lab.png'), fullPage: true });
await browser.close();
check('screenshot_written', existsSync(join(OUT, 'shots/01-avatars-lab.png')));

summary.ok = summary.errors.length === 0;
writeFileSync(join(OUT, 'SUMMARY.json'), JSON.stringify(summary, null, 2));
writeFileSync(join(OUT, 'coverage.json'), JSON.stringify(coverage, null, 2));
console.log(JSON.stringify({ ok: summary.ok, checks: summary.checks.length, errors: summary.errors }, null, 2));
process.exit(summary.ok ? 0 : 1);
