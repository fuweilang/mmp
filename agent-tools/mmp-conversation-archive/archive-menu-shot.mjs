#!/usr/bin/env node
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { join } from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/fuweilang/Documents/code/mmp/mammoth-agent/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');
const OUT = '/tmp/mmp-conversation-archive';
const WEB = 'http://127.0.0.1:3080/';
const GROUND = 'http://127.0.0.1:3100';
const GROUND_GW = 'http://127.0.0.1:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function loginCookie(phone) {
  const res = await fetch(`${GROUND}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password: '12345678' }),
  });
  return (res.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
}
function token(cookie) {
  const part = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('mammothai_access_token='));
  return part?.slice('mammothai_access_token='.length) || '';
}
const cookie = await loginCookie('13900001003');
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } });
await context.addCookies([
  { name: 'mammothai_access_token', value: token(cookie), url: WEB },
  { name: 'mammothai_access_token', value: token(cookie), url: GROUND_GW + '/' },
]);
const page = await context.newPage();
await page.goto(WEB, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
for (const name of ['跳过', '知道了', '开始使用', '关闭']) {
  const btn = page.getByRole('button', { name });
  if (await btn.count()) { try { await btn.first().click({ timeout: 1000 }); } catch {} }
}
// ensure workspace expanded
const alpha = page.locator('[role="treeitem"][aria-expanded]').first();
if (await alpha.count() && (await alpha.getAttribute('aria-expanded')) === 'false') {
  await alpha.click();
  await page.waitForTimeout(400);
}
const session = page.locator('[role="treeitem"]').filter({ hasNot: page.locator('[aria-expanded]') }).filter({ hasText: /.+/ }).first();
await session.scrollIntoViewIfNeeded();
await session.hover({ force: true });
await page.waitForTimeout(400);
// force-show row actions via evaluate if needed
await page.evaluate(() => {
  const row = [...document.querySelectorAll('[role="treeitem"]')].find(el => el.getAttribute('aria-expanded') == null && el.querySelector('[data-context-menu-trigger]'));
  const btn = row?.querySelector('[data-context-menu-trigger]');
  if (btn instanceof HTMLElement) {
    btn.style.opacity = '1';
    btn.style.visibility = 'visible';
    btn.click();
  }
});
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, 'shots/06-session-menu.png') });
const items = await page.locator('[role="menuitem"]').allTextContents();
writeFileSync(join(OUT, 'menu-items.json'), JSON.stringify({ items }, null, 2));
console.log(JSON.stringify({ items }, null, 2));
await browser.close();
