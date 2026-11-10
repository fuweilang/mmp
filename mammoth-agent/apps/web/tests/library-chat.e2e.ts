/** Keyless browser acceptance for persisted library cards and the real composer picker. */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAssistantMessage, createSystemMessage, createUserMessage } from '@mammoth-ai/mmp-llm'
import { Session, SessionId, SESSION_FORMAT_VERSION } from '@mammoth-ai/mmp-session'
import { launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, openSettings, REPO_ROOT } from './support.ts'

const SHOTS = resolve(REPO_ROOT, '../.superpowers/library-chat-attachments/visual')
const TITLE = 'Library attachment acceptance'
const QUESTION = 'Look at the selected document and explain its key points.'
const SOURCE = 'PRIVATE_SOURCE_BODY_LIBRARY_ACCEPTANCE_20261109'
const LONG_NAME = `${'Long document title with detailed policy wording '.repeat(8)}.docx`

function historyFixture(): string {
  const session = Session.create(SessionId('library-history-template'))
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('Synthetic acceptance context.') }, { surfaceOp: 'append' })
  const user = session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [
    { type: 'text', text: SOURCE, reference: { source: 'library', nodeId: 'history-node', versionId: 'history-v1', name: 'Slogan master.docx' } },
    { type: 'text', text: QUESTION },
  ] }), { surfaceOp: 'append' })
  session.append('session/title', { title: TITLE, messageSeqs: [user.seq], source: { kind: 'fallback' } })
  session.append('request/header', { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } }, reason: 'initial' })
  session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createAssistantMessage({
    source: { provider: 'deepseek-official', model: 'deepseek-v4-flash' }, content: [{ type: 'text', text: 'History acceptance fixture loaded.' }],
  }) }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  return [JSON.stringify({ type: 'session', version: SESSION_FORMAT_VERSION, id: '{{sessionId}}', createdAt: Date.now() - 60_000,
    cwd: '{{cwd}}', isSeeded: false, delegationDepth: 0 }), ...session.snapshotEvents().map(event => JSON.stringify(event)), ''].join('\n')
}

async function openHistory(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: '搜索任务', exact: true })
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click()
  await page.getByRole('textbox', { name: '搜索任务名称', exact: true }).fill(QUESTION)
  const result = page.getByRole('tree', { name: '搜索结果' }).getByRole('treeitem')
  await result.waitFor({ state: 'visible', timeout: 30_000 })
  await result.click()
  await page.getByText(QUESTION, { exact: true }).waitFor({ timeout: 30_000 })
}

async function openPicker(page: Page): Promise<void> {
  await page.getByRole('button', { name: '添加文件或调用指令', exact: true }).click()
  await page.getByRole('option', { name: /^资料库/ }).click()
  await page.getByRole('dialog', { name: '选择资料', exact: true }).waitFor()
  await page.getByText(LONG_NAME, { exact: true }).waitFor()
}

describe('web e2e: library cards and picker', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    await mkdir(SHOTS, { recursive: true })
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, historyFixture(), 'library-attachment-visual')
    browser = await chromium.launch()
    page = await newEnglishPage(browser, 900)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.emulateMedia({ colorScheme: 'light' })
    tripwire = watchConsole(page)
    await page.route('**/ground-library/items?**', async (route) => {
      const query = new URL(route.request().url()).searchParams
      const ready = { id: 'ready', name: LONG_NAME, kind: 'FILE', scope: 'PRIVATE', updatedAt: '2026-11-09T10:00:00Z',
        currentVersion: { id: 'v1', versionNo: 1, parseStatus: 'READY', sizeBytes: 2048 } }
      const shared = { ...ready, id: 'shared', name: 'Shared strategy.pdf', scope: 'ENTERPRISE', currentVersion: { ...ready.currentVersion, id: 'shared-v1' } }
      const pending = { ...ready, id: 'pending', name: 'Still parsing.pdf', currentVersion: { ...ready.currentVersion, id: 'pending-v1', parseStatus: 'PROCESSING' } }
      const items = query.get('q') ? [ready] : query.get('view') === 'shared' ? [shared] : [ready, pending]
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items, total: items.length, breadcrumb: [] }) })
    })
    await page.route('**/ground-library/used', route => route.fulfill({ contentType: 'application/json', body: '{}' }))
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await page.screenshot({ path: resolve(SHOTS, 'boot-diagnostic.png'), fullPage: true, animations: 'disabled' })
    await writeFile(resolve(SHOTS, 'boot-aria.txt'), await page.locator('body').ariaSnapshot())
    await openHistory(page)
  }, 180_000)

  afterAll(async () => {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: resolve(SHOTS, 'last-state.png'), fullPage: true, animations: 'disabled' })
      await writeFile(resolve(SHOTS, 'last-state-aria.txt'), await page.locator('body').ariaSnapshot())
    }
    await browser?.close(); await scaffold?.close()
  })

  it.each([
    { draft: '', shared: false },
    { draft: 'Existing question', shared: true },
  ])('returns typing to the right of selected files (draft: $draft, shared: $shared)', async ({ draft, shared }) => {
    const input = page.locator('[data-composer-input][contenteditable="true"]').first()
    await input.fill(draft)
    await openPicker(page)
    const dialog = page.getByRole('dialog', { name: '选择资料', exact: true })
    await dialog.getByRole('checkbox', { name: `选择 ${LONG_NAME}`, exact: true }).check()
    if (shared) {
      await dialog.getByRole('tab', { name: '企业共享', exact: true }).click()
      await dialog.getByRole('checkbox', { name: '选择 Shared strategy.pdf', exact: true }).check()
    }
    await dialog.getByRole('button', { name: '添加到对话', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    await expect.poll(() => input.evaluate(element => document.activeElement === element)).toBe(true)
    await page.keyboard.type('Explain these files')
    expect(await input.textContent()).toBe(`${draft === '' ? '' : `${draft} `}${LONG_NAME} ${shared ? 'Shared strategy.pdf ' : ''}Explain these files`)
    await input.fill('')
  }, 30_000)

  it('keeps persisted source contents out of history after reload and fits the picker at desktop and 390px', async () => {
    expect(await page.locator('[data-message-attachments]').getByRole('button', { name: 'Slogan master.docx', exact: true }).count()).toBe(1)
    expect(await page.locator('body').innerText()).not.toContain(SOURCE)
    await page.screenshot({ path: resolve(SHOTS, 'history-desktop-light.png'), fullPage: true, animations: 'disabled' })
    await page.reload({ waitUntil: 'load' })
    await page.getByText(QUESTION, { exact: true }).waitFor({ timeout: 30_000 })
    expect(await page.locator('[data-message-attachments]').getByRole('button', { name: 'Slogan master.docx', exact: true }).count()).toBe(1)
    expect(await page.locator('body').innerText()).not.toContain(SOURCE)
    const input = page.locator('[data-composer-input][contenteditable="true"]').first()
    await input.fill('Draft question stays here')
    await openPicker(page)
    const dialog = page.getByRole('dialog', { name: '选择资料', exact: true })
    const bounds = await dialog.boundingBox()
    expect(bounds?.width).toBe(800)
    expect(bounds?.height).toBe(640)
    const row = dialog.locator('li').filter({ hasText: LONG_NAME })
    expect((await row.boundingBox())?.height).toBeGreaterThanOrEqual(48)
    expect(await row.locator('svg').first().getAttribute('width')).toBe('20')
    expect(await dialog.getByText('解析中', { exact: true }).count()).toBe(1)
    expect(await dialog.getByRole('checkbox', { name: '选择 Still parsing.pdf', exact: true }).isDisabled()).toBe(true)
    expect(await row.locator('[tabindex="0"]').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
    await row.locator('[tabindex="0"]').hover()
    await page.getByRole('tooltip').filter({ hasText: LONG_NAME }).waitFor()
    await dialog.getByRole('heading', { name: '选择资料', exact: true }).hover()
    await page.screenshot({ path: resolve(SHOTS, 'picker-desktop-light.png'), fullPage: true, animations: 'disabled' })
    await dialog.getByRole('checkbox', { name: `选择 ${LONG_NAME}`, exact: true }).check()
    await dialog.getByRole('tab', { name: '企业共享', exact: true }).click()
    await dialog.getByRole('checkbox', { name: '选择 Shared strategy.pdf', exact: true }).check()
    await dialog.getByRole('tab', { name: '企业共享', exact: true }).press('Home')
    expect(await dialog.getByRole('tab', { name: '最近使用', exact: true }).getAttribute('aria-selected')).toBe('true')
    await dialog.getByRole('textbox', { name: '搜索资料', exact: true }).fill('Long document')
    expect(await dialog.getByRole('checkbox', { name: `选择 ${LONG_NAME}`, exact: true }).isChecked()).toBe(true)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    expect(await input.innerText()).toBe('Draft question stays here')

    await openSettings(page, 'zh')
    await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '深色', exact: true }).click()
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toContain('dark')
    await page.keyboard.press('Escape')
    await openPicker(page)
    await dialog.getByRole('checkbox', { name: `选择 ${LONG_NAME}`, exact: true }).check()
    await page.screenshot({ path: resolve(SHOTS, 'picker-desktop-dark.png'), fullPage: true, animations: 'disabled' })
    await page.setViewportSize({ width: 390, height: 844 })
    const narrow = await dialog.boundingBox()
    expect(narrow!.x).toBeGreaterThanOrEqual(0)
    expect(narrow!.x + narrow!.width).toBeLessThanOrEqual(390)
    expect(narrow!.y + narrow!.height).toBeLessThanOrEqual(844)
    await writeFile(resolve(SHOTS, 'narrow-metrics.json'), JSON.stringify(await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
        overflow: [...element.querySelectorAll('*')].map((child) => {
          const rect = child.getBoundingClientRect()
          return { tag: child.tagName, className: child.className, right: rect.right, width: rect.width }
        }).filter(child => child.right > box.right + 0.5) }
    }), null, 2))
    await page.screenshot({ path: resolve(SHOTS, 'picker-390-dark.png'), fullPage: true, animations: 'disabled' })
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(await dialog.getByRole('button', { name: '添加到对话', exact: true }).isVisible()).toBe(true)
    await page.screenshot({ path: resolve(SHOTS, 'picker-390-dark.png'), fullPage: true, animations: 'disabled' })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await page.setViewportSize({ width: 1280, height: 900 })
    await openSettings(page, 'zh')
    await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '浅色', exact: true }).click()
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toContain('light')
    await page.keyboard.press('Escape')
    await openPicker(page)
    await dialog.getByRole('checkbox', { name: `选择 ${LONG_NAME}`, exact: true }).check()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: resolve(SHOTS, 'picker-390-light.png'), fullPage: true, animations: 'disabled' })
    await dialog.getByRole('button', { name: '添加到对话', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    expect(await input.innerText()).toContain('Draft question stays here')
    expect(await input.innerText()).toContain(LONG_NAME)
    expect(await page.locator('body').innerText()).not.toContain(SOURCE)
    await page.screenshot({ path: resolve(SHOTS, 'draft-390-light.png'), fullPage: true, animations: 'disabled' })
    expect(tripwire.pageErrors).toEqual([])
  }, 120_000)
})
