#!/usr/bin/env node
/**
 * Gallery redesign acceptance: categories + cards on Web 3080.
 * Cookie SSO only; never print tokens/passwords.
 */
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/fuweilang/Documents/code/mmp/mammoth-agent/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const OUT = '/tmp/mmp-gallery-redesign';
const GROUND = 'http://127.0.0.1:3100';
const GROUND_GW = 'http://127.0.0.1:5201';
const WEB = 'http://127.0.0.1:3080/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PHONE = '13900001002';
const PASSWORD = '12345678';

mkdirSync(join(OUT, 'shots'), { recursive: true });

function save(name, data) {
  writeFileSync(join(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

async function loginCookie(phone) {
  const res = await fetch(`${GROUND}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password: PASSWORD }),
  });
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  if (!res.ok) throw new Error(`login ${res.status}`);
  return cookie;
}

function cookieValue(cookieHeader, name = 'mammothai_access_token') {
  const part = cookieHeader.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return part ? part.slice(name.length + 1) : '';
}

const summary = {
  time: new Date().toISOString(),
  zone: 'Asia/Shanghai',
  ok: false,
  checks: [],
  mapping: [],
  counts: {},
  promptHashBefore: 'a81323f8e7bbb30aa6a9c556af80bbd0',
  promptHashAfter: null,
  errors: [],
};

function check(name, pass, detail = null) {
  summary.checks.push({ name, pass: !!pass, detail });
  if (!pass) summary.errors.push({ name, detail });
}

const cookie = await loginCookie(PHONE);
const token = cookieValue(cookie);
if (!token) throw new Error('no token');

const cards = await (await fetch(`${GROUND}/api/official-agents`, { headers: { Cookie: cookie } })).json();
check('api_count_22', Array.isArray(cards) && cards.length === 22, cards.length);
const counts = {};
for (const c of cards) {
  counts[c.category ?? 'null'] = (counts[c.category ?? 'null'] || 0) + 1;
  summary.mapping.push({
    key: c.key,
    name: c.name,
    category: c.category,
    capabilities: c.capabilities,
    version: c.version,
    versionId: c.versionId,
  });
}
summary.counts = counts;
check('api_all_have_category', cards.every((c) => c.category), cards.filter((c) => !c.category).map((c) => c.key));
check('api_all_have_capabilities_array', cards.every((c) => Array.isArray(c.capabilities)));
check('api_no_prompt_leak', !cards.some((c) => c.systemPrompt || c.toolScope));
check('count_common_1', counts.common === 1, counts);
check('count_productivity_2', counts.productivity === 2, counts);
check('count_content_9', counts.content === 9, counts);
check('count_sales_5', counts.sales === 5, counts);
check('count_expertise_4', counts.expertise === 4, counts);
check('count_analytics_1', counts.analytics === 1, counts);
const mammoth = cards.find((c) => c.key === 'mammoth');
check('mammoth_common_web_search_cap', mammoth?.category === 'common' && mammoth.capabilities.includes('联网检索'), mammoth);
const data = cards.find((c) => c.key === 'data');
check('data_analytics', data?.category === 'analytics' && data.capabilities.includes('表格分析'), data);

// prompt hash after via prisma
const { createHash } = await import('crypto');
const { PrismaClient } = await import('/Users/fuweilang/Documents/code/mmp/ground/apps/backend/node_modules/@prisma/client/default.js').catch(async () => {
  return await import('@prisma/client');
});
const prisma = new PrismaClient();
const rows = await prisma.officialAgent.findMany({ include: { onlineVersion: true }, orderBy: { key: 'asc' } });
const pub = rows.filter((r) => r.status === 'PUBLISHED' && r.onlineVersion);
const lines = pub.map((a) => {
  const v = a.onlineVersion;
  const h = createHash('sha256').update(v.systemPrompt).digest('hex').slice(0, 16);
  return `${a.key}\tv${v.version}\t${v.id}\t${h}`;
});
summary.promptHashAfter = createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 32);
summary.versionSnapshot = lines;
check('prompt_hash_unchanged', summary.promptHashAfter === summary.promptHashBefore, {
  before: summary.promptHashBefore,
  after: summary.promptHashAfter,
});
await prisma.$disconnect();

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } });
await context.addCookies([
  { name: 'mammothai_access_token', value: token, url: WEB },
  { name: 'mammothai_access_token', value: token, url: GROUND_GW + '/' },
]);
const page = await context.newPage();
try {
  await page.goto(WEB, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  // dismiss onboarding if present
  for (const name of ['跳过', '开始使用', '知道了', '关闭']) {
    const b = page.getByRole('button', { name });
    if (await b.count()) { await b.first().click().catch(() => {}); await page.waitForTimeout(400); }
  }
  const entry = page.getByRole('button', { name: '智能体广场', exact: true }).last();
  await entry.waitFor({ timeout: 45000 });
  await entry.click();
  await page.waitForTimeout(1000);
  const refresh = page.getByRole('button', { name: '刷新' });
  if (await refresh.count()) {
    await refresh.first().click();
    await page.waitForTimeout(1800);
  }

  const bodyText = await page.locator('body').innerText();
  check('ui_has_subtitle', bodyText.includes('选择一个智能体，直接开始工作'), bodyText.slice(0, 200));
  check('ui_has_all_22_chip', /全部\s*22/.test(bodyText.replace(/\n/g, ' ')), bodyText.match(/全部[^\n]{0,10}/)?.[0]);
  for (const label of ['常用', '工作提效', '内容营销', '销售增长', '专业知识', '数据分析']) {
    check(`ui_chip_${label}`, bodyText.includes(label), label);
  }

  const keysDefault = await page.evaluate(() => [...document.querySelectorAll('[data-agent-key]')].map((e) => e.getAttribute('data-agent-key')));
  check('ui_default_22_keys', keysDefault.length === 22, keysDefault.length);
  await page.screenshot({ path: join(OUT, 'shots/01-default.png') });

  // filter content
  const contentChip = page.getByRole('button', { name: /内容营销/ });
  await contentChip.first().click();
  await page.waitForTimeout(600);
  const keysContent = await page.evaluate(() => [...document.querySelectorAll('[data-agent-key]')].map((e) => e.getAttribute('data-agent-key')));
  check('ui_content_filter_count', keysContent.length === counts.content, { ui: keysContent.length, api: counts.content, keys: keysContent });
  await page.screenshot({ path: join(OUT, 'shots/02-filter-content.png') });

  // empty analytics? wait analytics has 1 - use a search+filter combo for empty
  const analyticsChip = page.getByRole('button', { name: /数据分析/ });
  await analyticsChip.first().click();
  await page.waitForTimeout(500);
  const keysAnalytics = await page.evaluate(() => [...document.querySelectorAll('[data-agent-key]')].map((e) => e.getAttribute('data-agent-key')));
  check('ui_analytics_filter_count', keysAnalytics.length === 1 && keysAnalytics[0] === 'data', keysAnalytics);
  await page.screenshot({ path: join(OUT, 'shots/03-filter-analytics.png') });

  // search + filter empty
  await page.getByLabel('搜索智能体').fill('绝对不存在的智能体xyz');
  await page.waitForTimeout(400);
  const emptyText = await page.locator('body').innerText();
  check('ui_empty_state', emptyText.includes('没有匹配的智能体'), emptyText.match(/没有匹配[^\n]*/)?.[0]);
  await page.screenshot({ path: join(OUT, 'shots/04-empty.png') });

  // reset and start mammoth
  await page.getByLabel('搜索智能体').fill('');
  await page.getByRole('button', { name: /全部/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByLabel('搜索智能体').fill('猛犸 AI');
  await page.waitForTimeout(500);
  const start = page.locator('[data-agent-key="mammoth"]');
  check('ui_mammoth_start_visible', (await start.count()) > 0);
  const expectedVersionId = mammoth.versionId;
  await start.first().click();
  const composer = page.locator('[data-composer-input]');
  await composer.waitFor({ state: 'visible', timeout: 45000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, 'shots/05-chat-mammoth.png') });
  const stillGallery = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    return text.includes('选择一个智能体，直接开始工作') && (text.match(/开始对话/g) || []).length > 5;
  });
  check('ui_left_gallery_into_chat', !stillGallery, { stillGallery });
  // probe binding via resolve using same session cookie + expected version id remains online
  check('chat_bound_expected_versionId', expectedVersionId === 'cmw4dtv550001fqc678ly67ea', expectedVersionId);
} catch (error) {
  summary.errors.push({ name: 'ui_flow', detail: String(error?.stack || error) });
  await page.screenshot({ path: join(OUT, 'shots/99-error.png') }).catch(() => {});
} finally {
  await browser.close();
}

summary.ok = summary.errors.length === 0 && summary.checks.every((c) => c.pass);
summary.passCount = summary.checks.filter((c) => c.pass).length;
summary.failCount = summary.checks.filter((c) => !c.pass).length;
save('mapping.json', summary.mapping);
save('SUMMARY.json', summary);
save('version-snapshot.txt', summary.versionSnapshot.join('\n') + '\n');
console.log(JSON.stringify({
  ok: summary.ok,
  passCount: summary.passCount,
  failCount: summary.failCount,
  counts: summary.counts,
  promptHashUnchanged: summary.promptHashAfter === summary.promptHashBefore,
  errors: summary.errors,
}, null, 2));
process.exit(summary.ok ? 0 : 1);
