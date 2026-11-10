/** Real built-Web acceptance; Ground transport is synthetic, document bytes and preview engines are real. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { openSettings, REPO_ROOT, ZH_BROWSER_LOCALE } from './support.ts'

const ARTIFACTS = resolve(REPO_ROOT, '../.superpowers/library-tree-inline-preview')
const FIXTURES = resolve(ARTIFACTS, 'fixtures')
const VISUAL = resolve(ARTIFACTS, 'visual')
const LONG_NAME = `${'Long library document title '.repeat(8)}.md`
const documents = {
  markdown: { name: LONG_NAME, file: 'guide.md', mime: 'text/markdown' },
  html: { name: 'Styled HTML page.html', file: 'styled-page.html', mime: 'text/html' },
  pdf: { name: 'Two-page original.pdf', file: 'two-pages.pdf', mime: 'application/pdf' },
  excel: { name: 'Styled workbook.xlsx', file: 'styled-workbook.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  word: { name: 'Two-page Word.docx', file: 'docx-render.pdf', mime: 'application/pdf' },
  slides: { name: 'Two-slide presentation.pptx', file: 'pptx-render.pdf', mime: 'application/pdf' },
  image: { name: 'Shared color image.png', file: 'color-image.png', mime: 'image/png' },
  slow: { name: 'Slow failure.txt', file: 'guide.md', mime: 'text/plain' },
  denied: { name: 'Access denied.md', file: 'guide.md', mime: 'text/markdown' },
} as const

type DocumentId = keyof typeof documents
const listQueries: { view: string | null; parentId: string | null }[] = []
const byteRequests: string[] = []
const item = (id: DocumentId, scope = 'PRIVATE') => ({ id, name: documents[id].name, kind: 'FILE', scope,
  canManage: scope === 'PRIVATE', currentVersion: { id: `${id}-v1`, versionNo: 1, parseStatus: id === 'excel' ? 'FAILED' : 'READY', sizeBytes: 4096 } })
const folder = (id: string, name: string, scope = 'PRIVATE') => ({ id, name, kind: 'FOLDER', scope, canManage: scope === 'PRIVATE' })

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: resolve(VISUAL, `${name}.png`), fullPage: true, animations: 'disabled' })
  await writeFile(resolve(VISUAL, `${name}.aria.txt`), await page.locator('body').ariaSnapshot())
}

async function coloredPixels(canvas: Locator): Promise<number> {
  return canvas.evaluate((element) => {
    const node = element as HTMLCanvasElement
    const data = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data
    let blue = 0
    for (let i = 0; i < data.length; i += 4) if (data[i]! < 100 && data[i + 1]! < 160 && data[i + 2]! > 100 && data[i + 3]! > 100) blue++
    return blue
  })
}

async function pdfEvidence(page: Page, name: string, text: string): Promise<void> {
  const preview = page.locator('main[aria-label="查看原文"]')
  await preview.getByRole('heading', { name, exact: true }).waitFor()
  await preview.locator('[data-pdf-preview]').waitFor({ timeout: 30_000 })
  const canvases = preview.locator('[data-pdf-preview] canvas')
  expect(await canvases.count()).toBe(2)
  await expect.poll(() => canvases.first().evaluate(element => (element as HTMLCanvasElement).width), { timeout: 30_000 }).toBeGreaterThan(100)
  expect(await preview.getByRole('note').count()).toBe(0)
  const layout = await preview.locator('[data-pdf-preview]').evaluate(element => {
    const style = getComputedStyle(element)
    const surface = element.querySelector('[data-document-zoom-surface]')!
    const scrollport = element.closest('[data-document-zoom-scrollport]')!
    return { padding: style.padding, gap: style.gap, background: style.backgroundColor,
      shadow: getComputedStyle(surface).boxShadow,
      widthDifference: Math.abs(surface.getBoundingClientRect().width - scrollport.clientWidth) }
  })
  expect(layout).toEqual({ padding: '0px', gap: '0px', background: 'rgb(255, 255, 255)', shadow: 'none', widthDifference: 0 })
  await preview.locator('[data-pdf-text]').filter({ hasText: text }).first().waitFor({ timeout: 30_000 })
  await preview.locator('[data-pdf-page]').nth(1).scrollIntoViewIfNeeded()
  await expect.poll(() => canvases.nth(1).evaluate(element => (element as HTMLCanvasElement).width), { timeout: 30_000 }).toBeGreaterThan(100)
  await expect.poll(() => preview.locator('[data-pdf-text]').nth(1).innerText(), { timeout: 30_000 }).toContain(text)
  await preview.locator('[data-pdf-text]').first().locator('span').filter({ hasText: text }).first().scrollIntoViewIfNeeded()
  expect(await page.getByRole('dialog').count()).toBe(0)
}

describe('web e2e: library trees and inline formatted bytes', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let slowStarted: Promise<void>
  let releaseSlow: () => void
  let slowDone: Promise<void>

  beforeAll(async () => {
    await mkdir(VISUAL, { recursive: true })
    // These files are generated once with create-fixtures.mjs, including real LibreOffice output.
    await Promise.all(Object.values(documents).map(document => readFile(resolve(FIXTURES, document.file))))
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    page = await browser.newPage({ locale: ZH_BROWSER_LOCALE, timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 900 } })
    await page.setViewportSize({ width: 1440, height: 900 })
    tripwire = watchConsole(page)
    await page.route('**/ground-library/**', async route => {
      const url = new URL(route.request().url())
      const path = url.pathname
      if (path.endsWith('/config')) {
        await route.fulfill({ json: { enabled: true, maxFileBytes: 10_000_000, allowedExtensions: ['md', 'html', 'pdf', 'xlsx', 'docx', 'pptx', 'png'] } }); return
      }
      if (path.endsWith('/items')) {
        const view = url.searchParams.get('view'); const parentId = url.searchParams.get('parentId')
        listQueries.push({ view, parentId })
        const items = view === 'recent' ? [item('markdown'), item('html'), item('pdf'), item('denied')] : view === 'shared'
          ? parentId === 'shared-parent' ? [folder('shared-child', 'Shared nested', 'ENTERPRISE')]
            : parentId === 'shared-child' ? [item('image', 'ENTERPRISE')] : [folder('shared-parent', 'Shared folder', 'ENTERPRISE')]
          : parentId === 'personal-parent' ? [folder('personal-child', 'Personal nested')]
            : parentId === 'personal-child' ? [item('markdown')]
              : [folder('personal-parent', 'Personal folder'), item('markdown'), item('html'), item('pdf'), item('excel'), item('word'), item('slides'), item('slow')]
        await route.fulfill({ json: { items, total: items.length, breadcrumb: [] } }); return
      }
      const match = path.match(/\/nodes\/([^/]+)\/(preview|download|render)$/)
      if (match) {
        const id = match[1] as DocumentId; const operation = match[2]
        const document = documents[id]
        expect(document).toBeDefined()
        expect(url.searchParams.get('versionId')).toBe(`${id}-v1`)
        if (operation === 'preview') {
          if (id === 'denied') { await route.fulfill({ status: 403, json: { message: 'Preview permission refused' } }); return }
          await route.fulfill({ json: { nodeId: id, name: document.name, versionId: `${id}-v1`, versionNo: 1, previewKind: 'file' } }); return
        }
        byteRequests.push(`${id}/${operation}`)
        if (id === 'slow') {
          const released = new Promise<void>(resolveRelease => { releaseSlow = resolveRelease })
          slowStartedResolve()
          await released
          await route.fulfill({ status: 503, json: { message: 'stale slow failure must stay invisible' } })
          slowDoneResolve(); return
        }
        expect(operation).toBe(id === 'word' || id === 'slides' ? 'render' : 'download')
        expect(url.searchParams.has('inline')).toBe(false)
        const fonts = id === 'word' || id === 'slides'
          ? JSON.parse(await readFile(resolve(FIXTURES, `${id === 'word' ? 'docx' : 'pptx'}-conversion.json`), 'utf8')).missingFonts as string[] : []
        await route.fulfill({ contentType: document.mime, headers: { 'x-mmp-missing-fonts': encodeURIComponent(JSON.stringify(fonts)) }, body: await readFile(resolve(FIXTURES, document.file)) }); return
      }
      await route.fulfill({ json: {} })
    })
    let slowStartedResolve!: () => void
    let slowDoneResolve!: () => void
    slowStarted = new Promise<void>(resolveStarted => { slowStartedResolve = resolveStarted })
    slowDone = new Promise<void>(resolveDone => { slowDoneResolve = resolveDone })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.getByRole('button', { name: '资料库', exact: true }).click()
    await page.locator('[data-group="mine"]').getByRole('button', { name: 'Personal folder', exact: true }).waitFor({ timeout: 30_000 })
  }, 180_000)

  afterAll(async () => {
    releaseSlow?.()
    if (page && !page.isClosed()) await shot(page, 'last-state')
    await writeFile(resolve(ARTIFACTS, 'transport-evidence.json'), JSON.stringify({
      note: 'Built Web shell and registered document.preview.bytes factory are real. Ground lists, metadata, auth decisions and byte endpoints are synthetic. DOCX/PPTX responses contain actual installed LibreOffice conversion output; this test does not accept Host authorization or conversion HTTP.',
      listQueries, byteRequests,
    }, null, 2))
    await browser?.close(); await scaffold?.close()
  })

  it('keeps independent recursive category trees and renders actual formats inline', async () => {
    const mine = page.locator('[data-group="mine"]')
    const shared = page.locator('[data-group="shared"]')
    const preview = page.locator('main[aria-label="查看原文"]')
    expect(await page.locator('aside input[type="checkbox"]').count()).toBe(0)
    expect(await page.locator('aside').getByRole('button', { name: '上传文件', exact: true }).count()).toBe(0)
    await page.getByRole('button', { name: '最近使用', exact: true }).click()
    await preview.getByRole('heading', { name: '最近使用', exact: true }).waitFor()
    await preview.getByRole('button', { name: documents.html.name, exact: true }).waitFor()
    expect(await page.locator('[data-group="recent"] button').count()).toBe(1)
    await shot(page, 'recent-list-desktop-light')
    await preview.getByRole('button', { name: documents.html.name, exact: true }).click()
    await preview.getByRole('heading', { name: documents.html.name, exact: true }).waitFor()
    await preview.locator('iframe').waitFor()
    expect(await page.getByRole('dialog').count()).toBe(0)
    await preview.getByRole('button', { name: '关闭', exact: true }).click()
    await preview.getByRole('heading', { name: '最近使用', exact: true }).waitFor()
    await preview.getByRole('button', { name: documents.denied.name, exact: true }).click()
    await preview.getByRole('alert').filter({ hasText: 'Preview permission refused' }).waitFor()
    expect(await preview.getByRole('heading', { name: documents.denied.name, exact: true }).count()).toBe(0)
    await preview.getByRole('button', { name: '关闭', exact: true }).click()
    await preview.getByRole('heading', { name: '最近使用', exact: true }).waitFor()
    await mine.getByRole('button', { name: '我的资料', exact: true }).click()
    await page.getByRole('searchbox', { name: '搜索资料', exact: true }).fill('Personal folder')
    await mine.getByRole('button', { name: '新建 · Personal folder', exact: true }).click()
    await page.getByRole('menuitem', { name: '上传文件', exact: true }).waitFor()
    await shot(page, 'folder-plus-search-desktop-light')
    await page.keyboard.press('Escape')
    await page.getByRole('searchbox', { name: '搜索资料', exact: true }).fill('')
    await mine.getByRole('button', { name: '新建 · Personal folder', exact: true }).click()
    await page.getByRole('menuitem', { name: '上传文件', exact: true }).waitFor()
    await shot(page, 'folder-plus-desktop-light')
    await page.keyboard.press('Escape')
    await mine.getByRole('button', { name: 'Personal folder', exact: true }).click()
    await mine.getByRole('button', { name: 'Personal nested', exact: true }).click()
    expect(await preview.getByRole('table').count()).toBe(0)
    expect(await page.getByRole('dialog').count()).toBe(0)
    await mine.getByRole('button', { name: '我的资料', exact: true }).click()
    expect(await mine.getByRole('button', { name: 'Personal nested', exact: true }).isVisible()).toBe(false)
    await mine.getByRole('button', { name: '我的资料', exact: true }).click()
    expect(await mine.getByRole('button', { name: 'Personal nested', exact: true }).isVisible()).toBe(true)
    await shared.getByRole('button', { name: '企业共享', exact: true }).click()
    await shared.getByRole('button', { name: 'Shared folder', exact: true }).click()
    await shared.getByRole('button', { name: 'Shared nested', exact: true }).click()
    await shared.getByRole('button', { name: documents.image.name, exact: true }).click()
    const image = preview.getByRole('img', { name: documents.image.name, exact: true })
    await image.waitFor()
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(320)
    await shared.getByRole('button', { name: '企业共享', exact: true }).click()
    expect(await image.isVisible()).toBe(true)
    expect(await shared.getByRole('button', { name: 'Shared nested', exact: true }).isVisible()).toBe(false)
    expect(await mine.getByRole('button', { name: 'Personal nested', exact: true }).isVisible()).toBe(true)
    await shared.getByRole('button', { name: '企业共享', exact: true }).click()
    expect(await shared.getByRole('button', { name: 'Shared nested', exact: true }).isVisible()).toBe(true)
    expect(listQueries.filter(query => query.parentId?.startsWith('shared-')).every(query => query.view === 'shared')).toBe(true)
    expect(listQueries.some(query => query.parentId === 'shared-child' && query.view === 'shared')).toBe(true)
    await shot(page, 'dual-trees-image-desktop-light')

    // Collapse the personal branch so the root Markdown file has a unique accessible name.
    await mine.getByRole('button', { name: /展开或收起.*Personal folder/ }).click()
    await mine.getByRole('button', { name: LONG_NAME, exact: true }).click()
    await preview.getByRole('heading', { name: 'Library acceptance heading', exact: true }).waitFor()
    expect(await preview.getByRole('table').getByRole('cell', { name: 'Rendered table cell', exact: true }).count()).toBe(1)
    expect(await preview.locator('strong').innerText()).toBe('bold evidence')
    expect(await preview.getByRole('listitem').count()).toBe(2)
    expect(await preview.getByRole('table').count()).toBe(1)
    expect(await page.getByRole('dialog').count()).toBe(0)
    await shot(page, 'markdown-desktop-light')

    await mine.getByRole('button', { name: documents.html.name, exact: true }).click()
    const html = preview.frameLocator('iframe')
    await html.getByRole('heading', { name: 'Styled HTML heading', exact: true }).waitFor({ timeout: 30_000 })
    expect(await html.getByRole('cell', { name: 'HTML rendered table cell', exact: true }).count()).toBe(1)
    expect(await html.getByRole('heading', { name: 'Styled HTML heading', exact: true }).evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(31, 78, 120)')
    await shot(page, 'html-desktop-light')

    await mine.getByRole('button', { name: documents.pdf.name, exact: true }).click()
    await pdfEvidence(page, documents.pdf.name, 'Library PDF page')
    expect(await coloredPixels(preview.locator('canvas').first())).toBeGreaterThan(1000)
    await preview.locator('[data-pdf-page]').first().scrollIntoViewIfNeeded()
    const selectable = preview.locator('[data-pdf-text] span').filter({ hasText: 'Library PDF page 1' }).first()
    await selectable.click({ clickCount: 3 })
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim())).toContain('Library PDF page 1')
    await shot(page, 'pdf-desktop-light')
    for (const id of ['word', 'slides'] as const) {
      await mine.getByRole('button', { name: documents[id].name, exact: true }).click()
      await pdfEvidence(page, documents[id].name, 'Office preview')
      expect(await preview.getByRole('note').count()).toBe(0)
      await shot(page, `${id}-desktop-light`)
    }

    await mine.getByRole('button', { name: documents.excel.name, exact: true }).click()
    const workbook = preview.locator('[data-excel-preview]')
    await workbook.waitFor({ timeout: 30_000 })
    await workbook.getByText('Styled budget', { exact: true }).waitFor()
    await workbook.locator('canvas').first().waitFor()
    await expect.poll(() => coloredPixels(workbook.locator('canvas').first()), { timeout: 30_000 }).toBeGreaterThan(100)
    await workbook.locator('.fortune-sheet-overlay').click({ position: { x: 70, y: 30 } })
    await expect.poll(() => workbook.locator('.fortune-fx-input').innerText()).toBe('Budget styled cell')
    expect(await workbook.locator('.fortune-fx-input').getAttribute('contenteditable')).toBe('false')
    await shot(page, 'xlsx-styled-desktop-light')
    await workbook.getByText('Second sheet', { exact: true }).click()
    await workbook.locator('.fortune-sheet-overlay').click({ position: { x: 70, y: 30 } })
    await expect.poll(() => workbook.locator('.fortune-fx-input').innerText()).toBe('Second sheet value')
    await shot(page, 'xlsx-second-sheet-desktop-light')
    expect(await workbook.getByRole('alert').allTextContents()).toContain('A. 1 Second sheet value')

    await mine.getByRole('button', { name: documents.slow.name, exact: true }).click()
    await slowStarted
    await mine.getByRole('button', { name: LONG_NAME, exact: true }).click()
    await preview.getByRole('heading', { name: 'Library acceptance heading', exact: true }).waitFor()
    releaseSlow()
    await slowDone
    expect(await preview.innerText()).not.toContain('stale slow failure')
    expect(await preview.getByRole('heading', { name: 'Library acceptance heading', exact: true }).count()).toBe(1)
    expect(await preview.getByRole('alert').count()).toBe(0)

    for (const theme of ['深色', '浅色'] as const) {
      await openSettings(page, 'zh')
      await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: theme, exact: true }).click()
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toContain(theme === '深色' ? 'dark' : 'light')
      await page.keyboard.press('Escape')
      await page.setViewportSize({ width: 1440, height: 900 })
      const contrast = await mine.evaluate(element => {
        const aside = element.closest('aside')!
        const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1
        const context = canvas.getContext('2d')!
        const luminance = (color: string): number => {
          context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1)
          const rgba = context.getImageData(0, 0, 1, 1).data
          return [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
            const channel = rgba[index]! / 255
            return sum + weight * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
          }, 0)
        }
        const foreground = luminance(getComputedStyle(element.querySelector('button[title="Personal folder"]')!).color)
        const background = luminance(getComputedStyle(aside).backgroundColor)
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
      })
      await writeFile(resolve(VISUAL, `contrast-${theme === '深色' ? 'dark' : 'light'}.json`), JSON.stringify({ ratio: contrast, minimum: 4.5 }, null, 2))
      expect(contrast).toBeGreaterThan(4.5)
      await shot(page, `markdown-desktop-${theme === '深色' ? 'dark' : 'light'}`)
      await page.setViewportSize({ width: 390, height: 844 })
      await page.locator('[data-sidebar-drawer]').waitFor()
      if (await page.locator('[data-sidebar-drawer]:not([data-sidebar-collapsed])').count()) {
        await page.locator('[data-sidebar-mask]').click({ position: { x: 385, y: 200 } })
        await page.locator('[data-sidebar-drawer][data-sidebar-collapsed]').waitFor()
      }
      const categoryNavigation = page.getByRole('navigation', { name: '资料库分类', exact: true })
      expect(await categoryNavigation.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
      await shared.getByRole('button', { name: '企业共享', exact: true }).scrollIntoViewIfNeeded()
      expect(await categoryNavigation.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
      await shot(page, `tree-scroll-390-${theme === '深色' ? 'dark' : 'light'}`)
      await categoryNavigation.evaluate(element => { element.scrollTop = 0 })
      await shot(page, `markdown-390-${theme === '深色' ? 'dark' : 'light'}`)
      const metrics = await preview.evaluate(element => {
        const rect = element.getBoundingClientRect()
        return { x: rect.x, right: rect.right, width: rect.width, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }
      })
      await writeFile(resolve(VISUAL, `narrow-${theme === '深色' ? 'dark' : 'light'}-metrics.json`), JSON.stringify(metrics, null, 2))
      expect(metrics.x).toBeGreaterThanOrEqual(0)
      expect(metrics.right).toBeLessThanOrEqual(390)
      expect(metrics.width).toBeGreaterThan(120)
      const heading = preview.getByRole('heading', { name: 'Library acceptance heading', exact: true })
      expect(await heading.evaluate(element => {
        const rect = element.getBoundingClientRect()
        const hit = document.elementFromPoint(Math.max(1, rect.left + rect.width / 2), Math.max(1, rect.top + Math.min(rect.height / 2, 12)))
        return hit === element || element.contains(hit)
      })).toBe(true)
      expect(await preview.getByRole('heading', { name: 'Library acceptance heading', exact: true }).isVisible()).toBe(true)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.getByRole('button', { name: '最近使用', exact: true }).click()
      await preview.getByRole('button', { name: documents.html.name, exact: true }).waitFor()
      await shot(page, `recent-list-desktop-${theme === '深色' ? 'dark' : 'light'}`)
      await page.setViewportSize({ width: 390, height: 844 })
      await page.locator('[data-sidebar-drawer]').waitFor()
      if (await page.locator('[data-sidebar-drawer]:not([data-sidebar-collapsed])').count()) {
        await page.locator('[data-sidebar-mask]').click({ position: { x: 385, y: 200 } })
        await page.locator('[data-sidebar-drawer][data-sidebar-collapsed]').waitFor()
      }
      await page.locator('[data-sidebar-drawer] > [inert]').waitFor({ state: 'hidden' })
      await shot(page, `recent-list-390-${theme === '深色' ? 'dark' : 'light'}`)
      expect(await preview.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await mine.getByRole('button', { name: '新建 · 我的资料', exact: true }).click()
      const createMenu = page.getByRole('menu')
      await createMenu.getByRole('menuitem', { name: '上传文件', exact: true }).waitFor()
      const menuBounds = await createMenu.boundingBox()
      expect(menuBounds!.x).toBeGreaterThanOrEqual(0)
      expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(390)
      await shot(page, `folder-plus-390-${theme === '深色' ? 'dark' : 'light'}`)
      await page.keyboard.press('Escape')
      await page.setViewportSize({ width: 1440, height: 900 })
      await mine.getByRole('button', { name: LONG_NAME, exact: true }).click()
      await preview.getByRole('heading', { name: 'Library acceptance heading', exact: true }).waitFor()
    }
    expect(byteRequests).toEqual(expect.arrayContaining(['markdown/download', 'html/download', 'pdf/download', 'excel/download', 'word/render', 'slides/render', 'image/download']))
    expect(tripwire.pageErrors).toEqual([])
  }, 180_000)
})
