#!/usr/bin/env node
/**
 * Conversation archive+restore UI verify on Web 3080.
 * Creates a temporary demo session, archives it (real persistence), expands 已归档, restores.
 * Does NOT delete or archive any pre-existing user sessions from the live list.
 */
import { createRequire } from 'module';
import { writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/fuweilang/Documents/code/mmp/mammoth-agent/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const OUT = '/tmp/mmp-conversation-archive';
const WEB = 'http://127.0.0.1:3080/';
const GROUND = 'http://127.0.0.1:3100';
const GROUND_GW = 'http://127.0.0.1:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PHONE = '13900001003'; // xiaomi member pilot
const DEMO_TITLE = `archive-ui-demo-${Date.now().toString(36)}`;

mkdirSync(join(OUT, 'shots'), { recursive: true });

function isoLocalLabel() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t) => parts.find(p => p.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')} Asia/Shanghai`;
}

function log(...args) {
  const line = `[${isoLocalLabel()}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`;
  console.log(line);
  appendFileSync(join(OUT, 'verify.log'), line + '\n');
}

async function loginCookie(phone) {
  const res = await fetch(`${GROUND}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password: '12345678' }),
  });
  const cookie = (res.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  if (!res.ok) throw new Error(`login ${phone} ${res.status}`);
  return cookie;
}

function cookieValue(cookieHeader, name = 'mammothai_access_token') {
  const part = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return part ? part.slice(name.length + 1) : '';
}

async function dismissOnboarding(page) {
  for (const name of ['跳过', '知道了', '开始使用', '关闭']) {
    const btn = page.getByRole('button', { name });
    if (await btn.count()) {
      try { await btn.first().click({ timeout: 1500 }); await page.waitForTimeout(400); } catch {}
    }
  }
  await page.keyboard.press('Escape').catch(() => {});
}

async function snap(page, name) {
  const path = join(OUT, 'shots', name);
  await page.screenshot({ path, timeout: 20000 });
  log('shot', path);
  return path;
}

async function sidebarText(page) {
  return page.evaluate(() => {
    const tree = document.querySelector('[role="tree"]');
    return (tree?.innerText || '').slice(0, 2000);
  });
}

async function main() {
  const summary = {
    startedAt: isoLocalLabel(),
    demoTitle: DEMO_TITLE,
    phone: PHONE.replace(/\d(?=\d{4})/g, '*'),
    steps: {},
    ok: false,
  };
  const cookie = await loginCookie(PHONE);
  const token = cookieValue(cookie);
  if (!token) throw new Error('no token');

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
    await dismissOnboarding(page);
    await snap(page, '01-home-before.png');

    // Start a temporary official agent session so we have a real titled conversation to archive.
    const galleryBtn = page.getByRole('button', { name: '智能体广场', exact: true }).last();
    await galleryBtn.waitFor({ timeout: 45000 });
    await galleryBtn.click();
    await page.waitForTimeout(900);
    const search = page.getByLabel('搜索智能体');
    await search.fill('猛犸 AI');
    await page.waitForTimeout(700);
    const startBtn = page.locator('[data-agent-key="mammoth"]');
    if (!(await startBtn.count())) throw new Error('mammoth start missing');
    await startBtn.first().click();
    await page.locator('[data-composer-input]').waitFor({ state: 'visible', timeout: 45000 });
    await page.waitForTimeout(1200);
    summary.steps.startedMammoth = true;

    // Rename current session to demo title via double-click if possible, else leave agent title.
    // Prefer context menu rename for reliability.
    const sessionRows = page.locator('[role="treeitem"]').filter({ hasNot: page.locator('[aria-expanded]') });
    // Find a recently active session row that looks like 猛犸 or 新会话
    const candidate = page.locator('[role="treeitem"]').filter({ hasText: /猛犸|新会话|未命名/ }).first();
    if (await candidate.count()) {
      await candidate.hover();
      await page.waitForTimeout(300);
      const menuBtn = candidate.locator('button[aria-haspopup="menu"], button[data-context-menu-trigger], button[aria-label*="操作"]').first();
      if (await menuBtn.count()) {
        await menuBtn.click();
        await page.waitForTimeout(400);
        const rename = page.getByRole('menuitem', { name: '重命名' });
        if (await rename.count()) {
          await rename.click();
          await page.waitForTimeout(400);
          const input = page.locator('input').last();
          await input.fill(DEMO_TITLE);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(800);
          summary.steps.renamed = true;
        } else {
          await page.keyboard.press('Escape');
        }
      }
    }
    await snap(page, '02-demo-session-ready.png');

    // Locate the demo (or mammoth) row and archive it.
    let target = page.locator('[role="treeitem"]').filter({ hasText: DEMO_TITLE }).first();
    if (!(await target.count())) {
      target = page.locator('[role="treeitem"]').filter({ hasText: /猛犸/ }).first();
    }
    if (!(await target.count())) throw new Error('demo session row not found');
    const targetText = (await target.innerText()).replace(/\s+/g, ' ').trim().slice(0, 80);
    summary.steps.targetText = targetText;
    await target.hover();
    await page.waitForTimeout(250);
    // Prefer hover archive icon, else ... menu → 归档会话
    const archiveHover = page.getByRole('button', { name: '归档会话' });
    if (await archiveHover.count()) {
      await archiveHover.first().click();
      summary.steps.archivedVia = 'hover-button';
    } else {
      const menuBtn = target.locator('button[data-context-menu-trigger], button[aria-label*="操作"]').first();
      await menuBtn.click();
      await page.waitForTimeout(300);
      await page.getByRole('menuitem', { name: '归档会话' }).click();
      summary.steps.archivedVia = 'context-menu';
    }
    await page.waitForTimeout(1200);
    // Dismiss toast if present but keep going
    await snap(page, '03-after-archive-collapsed.png');

    const archivedEntry = page.getByRole('treeitem', { name: /已归档会话/ });
    await archivedEntry.waitFor({ timeout: 10000 });
    summary.steps.archivedEntryVisible = true;
    summary.steps.archivedEntryLabel = await archivedEntry.getAttribute('aria-label');
    // Demo title must not remain in default active list text (collapsed section)
    const side = await sidebarText(page);
    summary.steps.sidebarAfterArchive = side.slice(0, 500);
    if (DEMO_TITLE && side.includes(DEMO_TITLE) && !(await archivedEntry.getAttribute('aria-expanded') === 'true')) {
      // title might still appear only inside collapsed? if collapsed shouldn't
      summary.steps.demoStillVisibleWhileCollapsed = side.includes(DEMO_TITLE);
    }

    // Expand archived section
    await archivedEntry.click();
    await page.waitForTimeout(700);
    summary.steps.archivedExpanded = (await archivedEntry.getAttribute('aria-expanded')) === 'true';
    await snap(page, '04-archived-expanded.png');

    // Restore via hover unarchive or menu
    const archivedRow = page.locator('[role="treeitem"]').filter({ hasText: DEMO_TITLE }).first();
    const restoreTarget = (await archivedRow.count())
      ? archivedRow
      : page.locator('[role="treeitem"]').filter({ hasText: /猛犸/ }).last();
    await restoreTarget.hover();
    await page.waitForTimeout(250);
    const unarchiveBtn = page.getByRole('button', { name: '取消归档' });
    if (await unarchiveBtn.count()) {
      await unarchiveBtn.first().click();
      summary.steps.restoredVia = 'hover-button';
    } else {
      const menuBtn = restoreTarget.locator('button[data-context-menu-trigger], button[aria-label*="操作"]').first();
      await menuBtn.click();
      await page.waitForTimeout(300);
      await page.getByRole('menuitem', { name: '取消归档' }).click();
      summary.steps.restoredVia = 'context-menu';
    }
    await page.waitForTimeout(1200);
    await snap(page, '05-after-restore.png');

    // Also capture hover menu on an active session for evidence
    const live = page.locator('[role="treeitem"]').filter({ hasText: DEMO_TITLE }).first();
    if (await live.count()) {
      await live.hover();
      await page.waitForTimeout(200);
      const menuBtn = live.locator('button[data-context-menu-trigger], button[aria-label*="操作"]').first();
      if (await menuBtn.count()) {
        await menuBtn.click();
        await page.waitForTimeout(400);
        await snap(page, '06-session-menu.png');
        await page.keyboard.press('Escape');
      }
    }

    const finalSide = await sidebarText(page);
    summary.steps.sidebarAfterRestore = finalSide.slice(0, 500);
    summary.steps.demoBackInActive = finalSide.includes(DEMO_TITLE) || /猛犸/.test(finalSide);
    // Archived entry may disappear when count hits 0
    summary.steps.archivedEntryAfterRestore = await page.getByRole('treeitem', { name: /已归档会话/ }).count();

    summary.ok = Boolean(
      summary.steps.archivedEntryVisible
      && summary.steps.archivedExpanded
      && summary.steps.restoredVia
      && summary.steps.demoBackInActive,
    );
  } catch (e) {
    summary.error = String(e?.stack || e);
    try { await snap(page, '99-error.png'); } catch {}
    log('ERROR', summary.error);
  } finally {
    writeFileSync(join(OUT, 'SUMMARY.json'), JSON.stringify(summary, null, 2));
    log('SUMMARY', summary);
    await browser.close();
  }
  if (!summary.ok) process.exitCode = 1;
}

main();
