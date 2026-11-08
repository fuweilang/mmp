import { createRequire } from 'module';
import { writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/fuweilang/Documents/code/mmp/mammoth-agent/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const OUT = '/tmp/mmp-gallery-advanced-ui';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'shots'), { recursive: true });
mkdirSync(join(OUT, 'network'), { recursive: true });

const EXPECTED = {
  data: { versionId: 'cmw4h5epk0001i8omufs8r9zb', version: 2, name: '数据分析师', tool: 'tabular_analyze' },
  spy: { versionId: 'cmw4gyoto0049i833sasbmjyn', version: 1, name: '竞品情报官', tool: 'web_fetch' },
  boss: { versionId: 'cmw4h5eq50004i8omly0toiu4', version: 2, name: '猛犸大总管', tool: 'delegate_official_agent' },
};

const PROMPTS = {
  data: `请用表格分析工具统计以下CSV。总收入，并按city汇总revenue，只给实际计算结果。
city,revenue
上海,100
北京,40
上海,40
杭州,160
北京,50`,
  spy: `请用网页读取工具访问 https://example.com 并告诉我这个网页实际标题和正文例子，附来源。`,
  boss: `请委派给数据分析师实际计算表格：city,revenue 上海,5 上海,7 北京,3。只返回总收入和各城市总计。`,
};

function nowLocal() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}
function isoLocalLabel() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t) => parts.find(p => p.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')} Asia/Shanghai`;
}

const summary = {
  startedAt: isoLocalLabel(),
  kind: 'MMP Dev Electron UI E2E via Playwright connectOverCDP :9222',
  note: 'NOT Ground /analyze-tabular host fake; messages typed in live UI',
  expectedVersionIds: EXPECTED,
  gallery: {},
  cases: {},
  networkHits: [],
  errors: [],
  ok: false,
};

function save(name, data) {
  writeFileSync(join(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}
function log(...args) {
  const line = `[${isoLocalLabel()}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`;
  console.log(line);
  appendFileSync(join(OUT, 'ui-e2e.log'), line + '\n');
}

async function snap(page, name) {
  const path = join(OUT, 'shots', name);
  await page.screenshot({ path, timeout: 15000 }).catch(async (e) => {
    log('screenshot fail', name, String(e));
    await page.screenshot({ path, fullPage: false }).catch(() => {});
  });
  return path;
}

async function pageText(page) {
  return page.evaluate(() => (document.body?.innerText || '').slice(0, 12000));
}

async function openGallery(page) {
  const btn = page.getByRole('button', { name: '智能体广场' });
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(600);
  }
  const refresh = page.getByRole('button', { name: '刷新' });
  if (await refresh.count()) {
    await refresh.first().click();
    await page.waitForTimeout(2000);
  }
}

async function galleryCards(page) {
  return page.evaluate(() => {
    const keys = [...document.querySelectorAll('[data-agent-key]')].map(el => el.getAttribute('data-agent-key'));
    const cards = [...document.querySelectorAll('[data-agent-key]')].map(el => {
      const key = el.getAttribute('data-agent-key');
      const li = el.closest('li') || el.parentElement;
      const text = (li?.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      const ver = (text.match(/版本\s*(\d+)/) || [])[1] || null;
      return { key, aria: el.getAttribute('aria-label'), text: text.slice(0, 160), versionLabel: ver };
    });
    return { keys, cards, count: keys.length };
  });
}

async function startAgent(page, key) {
  // clear search first then search exact name to avoid wrong first card
  const search = page.getByLabel('搜索智能体');
  const name = EXPECTED[key].name;
  if (await search.count()) {
    await search.fill('');
    await page.waitForTimeout(200);
    await search.fill(name);
    await page.waitForTimeout(700);
  }
  const startBtn = page.locator(`[data-agent-key="${key}"]`);
  if (!(await startBtn.count())) throw new Error(`start button missing for ${key}`);
  const aria = await startBtn.first().getAttribute('aria-label');
  // capture version from nearby card text before click
  const cardMeta = await page.evaluate((k) => {
    const el = document.querySelector(`[data-agent-key="${k}"]`);
    const li = el?.closest('li') || el?.parentElement;
    const text = (li?.innerText || '').replace(/\s+/g, ' ').trim();
    const ver = (text.match(/版本\s*(\d+)/) || [])[1] || null;
    return { text: text.slice(0, 200), versionLabel: ver, aria: el?.getAttribute('aria-label') };
  }, key);
  await snap(page, `02-gallery-${key}.png`);
  await startBtn.first().click();
  // wait for composer
  const composer = page.locator('[data-composer-input]');
  await composer.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1200);
  return { aria, cardMeta };
}

async function typeAndSend(page, text) {
  const composer = page.locator('[data-composer-input]').first();
  await composer.click();
  await page.waitForTimeout(200);
  // Lexical: select-all clear then insertText
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(text);
  await page.waitForTimeout(300);
  const typed = await page.evaluate(() => {
    const el = document.querySelector('[data-composer-input]');
    return (el?.innerText || el?.textContent || '').slice(0, 500);
  });
  await snap(page, `03-typed-${Date.now()}.png`);
  const send = page.locator('button[aria-label="发送消息"]');
  if (await send.count()) {
    await send.first().click();
  } else {
    await page.keyboard.press('Enter');
  }
  return typed;
}

async function waitForTurn(page, { timeoutMs = 180000, toolHint = '', expectTexts = [] } = {}) {
  const start = Date.now();
  let last = '';
  let sawTool = false;
  let toolSnippets = [];
  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate((hint) => {
      const text = document.body?.innerText || '';
      const busy = !!document.querySelector('button[aria-label="正在发送消息"], button[aria-label="停止"], button[aria-busy="true"]')
        || /正在思考|正在运行|执行工具|Calling|tool/i.test(text.slice(-800));
      const stopVisible = !!document.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"]');
      const toolEls = [...document.querySelectorAll('[class*="tool"], [data-tool], [data-testid*="tool"]')]
        .map(el => (el.innerText || '').slice(0, 200)).filter(Boolean).slice(0, 20);
      const hasHint = !hint || text.includes(hint) || toolEls.some(t => t.includes(hint));
      // assistant-ish: look for recent message area
      return {
        textTail: text.slice(-3500),
        textFull: text.slice(0, 12000),
        busy: busy || stopVisible,
        stopVisible,
        hasHint,
        toolEls,
      };
    }, toolHint);
    last = state.textTail;
    if (state.hasHint || state.toolEls.some(t => /tabular|web_fetch|delegate|表格分析|网页|委派|读取/i.test(t))) {
      sawTool = true;
      toolSnippets = state.toolEls;
    }
    const doneBusy = !state.busy && !state.stopVisible;
    const hasExpect = expectTexts.length === 0 || expectTexts.every(t => state.textFull.includes(t) || state.textTail.includes(t));
    // need some assistant content beyond user prompt — heuristic: after send, wait until not busy and text grew
    if (doneBusy && (sawTool || hasExpect || Date.now() - start > 25000) && state.textTail.length > 50) {
      // extra settle
      await page.waitForTimeout(1500);
      const again = await page.evaluate(() => {
        const stopVisible = !!document.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"]');
        const sending = !!document.querySelector('button[aria-label="正在发送消息"]');
        return { stopVisible, sending, text: (document.body?.innerText || '').slice(0, 12000) };
      });
      if (!again.stopVisible && !again.sending) {
        return { text: again.text, sawTool, toolSnippets, elapsedMs: Date.now() - start };
      }
    }
    await page.waitForTimeout(1200);
  }
  return { text: last, sawTool, toolSnippets, elapsedMs: Date.now() - start, timedOut: true };
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts().flatMap(c => c.pages()).find(p => (p.url() || '').includes('mmp-app'))
  || browser.contexts()[0]?.pages()?.[0];
if (!page) throw new Error('no mmp-app page');
await page.bringToFront().catch(() => {});

const netLog = [];
page.on('response', async (res) => {
  try {
    const url = res.url();
    if (!/official-agent|analyze-tabular|web_fetch|delegate|chat\/completions|tools|gateway|session/i.test(url)) return;
    const entry = {
      at: isoLocalLabel(),
      status: res.status(),
      url: url.slice(0, 300),
      method: res.request().method(),
    };
    if (/official-agents\/[^/]+\/(resolve|create)|official-agents\/.*resolve/i.test(url) || /createSession|officialAgent/i.test(url)) {
      try {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('json')) {
          const json = await res.json().catch(() => null);
          if (json) {
            entry.bodyKeys = Object.keys(json);
            entry.versionId = json.versionId || json.officialAgentVersionId || json.binding?.versionId;
            entry.toolScope = json.toolScope;
            entry.agentKey = json.key || json.agentKey;
            entry.snippet = JSON.stringify(json).slice(0, 800);
          }
        }
      } catch {}
    }
    netLog.push(entry);
    summary.networkHits.push(entry);
  } catch {}
});

page.on('console', (msg) => {
  const t = msg.text();
  if (/tabular|web_fetch|delegate|tool|official|error|fail/i.test(t)) {
    appendFileSync(join(OUT, 'console-interesting.log'), `[${isoLocalLabel()}] ${msg.type()}: ${t.slice(0, 500)}\n`);
  }
});

try {
  log('begin UI E2E');
  await openGallery(page);
  await snap(page, '01-gallery-refreshed.png');
  // clear search to see all
  const search = page.getByLabel('搜索智能体');
  if (await search.count()) { await search.fill(''); await page.waitForTimeout(500); }
  let cards = await galleryCards(page);
  // if missing advanced cards, refresh again
  for (const key of ['data', 'spy', 'boss']) {
    if (!cards.keys.includes(key)) {
      log('missing card, refresh+search', key);
      await openGallery(page);
      if (await search.count()) {
        await search.fill(EXPECTED[key].name);
        await page.waitForTimeout(800);
      }
      cards = await galleryCards(page);
    }
  }
  if (await search.count()) { await search.fill(''); await page.waitForTimeout(400); }
  cards = await galleryCards(page);
  summary.gallery = {
    at: isoLocalLabel(),
    count: cards.count,
    keys: cards.keys,
    hasData: cards.keys.includes('data'),
    hasSpy: cards.keys.includes('spy'),
    hasBoss: cards.keys.includes('boss'),
    cards: cards.cards.filter(c => ['data', 'spy', 'boss'].includes(c.key)),
  };
  save('gallery.json', summary.gallery);
  log('gallery', summary.gallery);

  for (const key of ['data', 'spy', 'boss']) {
    const caseResult = {
      key,
      expectedVersionId: EXPECTED[key].versionId,
      startedAt: isoLocalLabel(),
      pass: false,
      failReasons: [],
    };
    try {
      await openGallery(page);
      const started = await startAgent(page, key);
      caseResult.cardMeta = started.cardMeta;
      caseResult.aria = started.aria;
      await snap(page, `04-${key}-session-open.png`);

      // try capture binding from page if exposed
      const binding = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        return {
          titleish: text.split('\n').slice(0, 40).join(' | ').slice(0, 400),
          hasComposer: !!document.querySelector('[data-composer-input]'),
        };
      });
      caseResult.sessionProbe = binding;

      const typed = await typeAndSend(page, PROMPTS[key]);
      caseResult.typedPreview = typed.slice(0, 200);
      await snap(page, `05-${key}-after-send.png`);

      const expectTexts = key === 'data'
        ? ['330', '140', '90', '160']
        : key === 'spy'
          ? ['Example Domain']
          : ['15', '12', '3'];
      const turn = await waitForTurn(page, {
        timeoutMs: key === 'boss' ? 240000 : 180000,
        toolHint: EXPECTED[key].tool,
        expectTexts,
      });
      caseResult.elapsedMs = turn.elapsedMs;
      caseResult.timedOut = !!turn.timedOut;
      caseResult.sawToolUi = turn.sawTool;
      caseResult.toolSnippets = turn.toolSnippets;
      caseResult.responseText = (turn.text || '').slice(0, 6000);
      save(`chat-${key}.txt`, turn.text || '');
      await snap(page, `06-${key}-final.png`);

      // network versionId if any
      const relatedNet = netLog.filter(n =>
        (n.versionId && EXPECTED[key].versionId === n.versionId)
        || (n.snippet && n.snippet.includes(EXPECTED[key].versionId))
        || (n.url && n.url.includes(EXPECTED[key].versionId))
        || (n.agentKey === key)
      );
      caseResult.relatedNetwork = relatedNet.slice(-10);
      const observedVid = relatedNet.map(n => n.versionId).filter(Boolean).at(-1)
        || (netLog.map(n => n.versionId).filter(Boolean).at(-1));
      caseResult.observedVersionId = observedVid || null;
      caseResult.versionIdMatch = !observedVid || observedVid === EXPECTED[key].versionId;

      // assertions
      if (caseResult.timedOut) caseResult.failReasons.push('timeout waiting for turn settle');
      if (!caseResult.responseText || caseResult.responseText.trim().length < 20) {
        caseResult.failReasons.push('empty/short response');
      }
      if (/工具未注册|not streamed|tool not (found|registered)|前端绑定失败|未开通/i.test(caseResult.responseText)) {
        caseResult.failReasons.push('error phrase in UI text');
      }
      if (key === 'data') {
        const okNums = ['330', '上海'].every(t => caseResult.responseText.includes(t))
          && (caseResult.responseText.includes('140') || caseResult.responseText.includes('上海.*140'.replace('.*',')')));
        // looser: all city sums somewhere
        const has330 = caseResult.responseText.includes('330');
        const has140 = caseResult.responseText.includes('140');
        const has90 = caseResult.responseText.includes('90');
        const has160 = caseResult.responseText.includes('160');
        caseResult.numeric = { has330, has140, has90, has160 };
        if (!(has330 && has140 && has90 && has160)) caseResult.failReasons.push(`numeric mismatch ${JSON.stringify(caseResult.numeric)}`);
        if (!/tabular_analyze|表格分析|分析工具/i.test(caseResult.responseText + JSON.stringify(caseResult.toolSnippets)) && !caseResult.sawToolUi) {
          caseResult.failReasons.push('no tabular tool evidence in UI');
        }
      }
      if (key === 'spy') {
        const hasTitle = /Example Domain/i.test(caseResult.responseText);
        caseResult.hasExampleTitle = hasTitle;
        if (!hasTitle) caseResult.failReasons.push('missing Example Domain title');
        if (!/web_fetch|网页读取|example\.com/i.test(caseResult.responseText + JSON.stringify(caseResult.toolSnippets)) && !caseResult.sawToolUi) {
          caseResult.failReasons.push('no web_fetch tool evidence in UI');
        }
      }
      if (key === 'boss') {
        const has15 = caseResult.responseText.includes('15');
        const has12 = caseResult.responseText.includes('12');
        const has3 = caseResult.responseText.includes('3');
        caseResult.numeric = { has15, has12, has3 };
        if (!(has15 && has12 && has3)) caseResult.failReasons.push(`boss numeric mismatch ${JSON.stringify(caseResult.numeric)}`);
        if (!/delegate_official_agent|委派|数据分析师|tabular/i.test(caseResult.responseText + JSON.stringify(caseResult.toolSnippets)) && !caseResult.sawToolUi) {
          caseResult.failReasons.push('no delegate evidence in UI');
        }
      }
      if (caseResult.cardMeta?.versionLabel && String(EXPECTED[key].version) !== String(caseResult.cardMeta.versionLabel)) {
        caseResult.failReasons.push(`gallery version label ${caseResult.cardMeta.versionLabel} != expected ${EXPECTED[key].version}`);
      }
      caseResult.pass = caseResult.failReasons.length === 0;
      caseResult.finishedAt = isoLocalLabel();
      log(`case ${key}`, { pass: caseResult.pass, failReasons: caseResult.failReasons, elapsedMs: caseResult.elapsedMs });
    } catch (e) {
      caseResult.failReasons.push(String(e?.stack || e));
      caseResult.pass = false;
      caseResult.finishedAt = isoLocalLabel();
      log(`case ${key} threw`, String(e));
      await snap(page, `99-${key}-error.png`).catch(() => {});
    }
    summary.cases[key] = caseResult;
    save(`case-${key}.json`, caseResult);
  }

  summary.finishedAt = isoLocalLabel();
  summary.ok = ['data', 'spy', 'boss'].every(k => summary.cases[k]?.pass);
  summary.galleryOk = summary.gallery.hasData && summary.gallery.hasSpy && summary.gallery.hasBoss;
  save('network.json', netLog);
  save('SUMMARY.json', summary);

  // EVIDENCE.md
  const md = [];
  md.push('# 任务10 UI E2E 证据（真实 MMP Dev Electron）');
  md.push('');
  md.push(`- 开始：${summary.startedAt}`);
  md.push(`- 结束：${summary.finishedAt}`);
  md.push(`- 方式：Playwright \`connectOverCDP http://127.0.0.1:9222\` → PID45128 MMP Dev`);
  md.push(`- **不是** Ground \`/analyze-tabular\` Host fake；消息由 UI composer 输入发送`);
  md.push(`- 登录会话：复用现有「超级管理员 / 平台工作区」（未登出）`);
  md.push('');
  md.push('## 期望 versionId（开聊 resolve 最新 published）');
  md.push('');
  md.push('| key | name | expected versionId | gallery version |');
  md.push('|-----|------|--------------------|-----------------|');
  for (const k of ['data', 'spy', 'boss']) {
    const c = summary.cases[k] || {};
    md.push(`| ${k} | ${EXPECTED[k].name} | \`${EXPECTED[k].versionId}\` | ${c.cardMeta?.versionLabel ?? '?'} |`);
  }
  md.push('');
  md.push('## 广场卡片');
  md.push('');
  md.push('```json');
  md.push(JSON.stringify(summary.gallery, null, 2));
  md.push('```');
  md.push('');
  md.push('## E2E Pass 映射');
  md.push('');
  md.push('| case | pass | elapsedMs | failReasons | observedVersionId |');
  md.push('|------|------|-----------|-------------|-------------------|');
  for (const k of ['data', 'spy', 'boss']) {
    const c = summary.cases[k] || {};
    md.push(`| ${k} | ${c.pass ? 'PASS' : 'FAIL'} | ${c.elapsedMs ?? ''} | ${(c.failReasons || []).join('; ') || '-'} | ${c.observedVersionId || c.cardMeta?.versionLabel || '-'} |`);
  }
  md.push('');
  md.push(`**overall ok=${summary.ok} galleryOk=${summary.galleryOk}**`);
  md.push('');
  for (const k of ['data', 'spy', 'boss']) {
    const c = summary.cases[k];
    if (!c) continue;
    md.push(`## ${k} 详情`);
    md.push('');
    md.push(`- startedAt: ${c.startedAt}`);
    md.push(`- finishedAt: ${c.finishedAt}`);
    md.push(`- cardMeta: \`${JSON.stringify(c.cardMeta)}\``);
    md.push(`- sawToolUi: ${c.sawToolUi}`);
    md.push(`- numeric: \`${JSON.stringify(c.numeric || {})}\``);
    md.push(`- screenshots: shots/02-gallery-${k}.png, shots/04-${k}-session-open.png, shots/05-${k}-after-send.png, shots/06-${k}-final.png`);
    md.push(`- response file: chat-${k}.txt`);
    md.push('');
    md.push('响应摘录：');
    md.push('');
    md.push('```');
    md.push((c.responseText || '').slice(0, 1800));
    md.push('```');
    md.push('');
  }
  md.push('## 产物目录');
  md.push('');
  md.push('`/tmp/mmp-gallery-advanced-ui/` — ui-e2e.mjs, SUMMARY.json, EVIDENCE.md, gallery.json, case-*.json, chat-*.txt, network.json, shots/, ui-e2e.log');
  save('EVIDENCE.md', md.join('\n'));
  log('DONE', { ok: summary.ok, galleryOk: summary.galleryOk });
  console.log(JSON.stringify({
    ok: summary.ok,
    galleryOk: summary.galleryOk,
    cases: Object.fromEntries(Object.entries(summary.cases).map(([k, v]) => [k, { pass: v.pass, failReasons: v.failReasons, elapsedMs: v.elapsedMs, versionLabel: v.cardMeta?.versionLabel, observedVersionId: v.observedVersionId }])),
  }, null, 2));
} catch (e) {
  summary.errors.push(String(e?.stack || e));
  summary.finishedAt = isoLocalLabel();
  save('SUMMARY.json', summary);
  save('EVIDENCE.md', `# UI E2E aborted\n\n${String(e?.stack || e)}\n`);
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
