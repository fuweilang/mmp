import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold } from './scaffold.ts'
import { newEnglishPage, REPO_ROOT } from './support.ts'

it('resizes the library directory, persists it and preserves responsive content space', async () => {
  const scaffold = await launchWebScaffold({})
  const browser = await chromium.launch()
  try {
    const page = await newEnglishPage(browser, 900)
    const errors: string[] = []
    page.on('pageerror', error => { errors.push(error.message) })
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.route('**/ground-library/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(
      route.request().url().includes('/config') ? { enabled: true } : { items: [], total: 0, breadcrumb: [] },
    ) }))
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    const shots = resolve(REPO_ROOT, '../.superpowers/library-resize/visual')
    await mkdir(shots, { recursive: true })
    try { await page.waitForSelector('[class*="frame"]', { timeout: 30_000 }) }
    catch (error) {
      await writeFile(resolve(shots, 'startup-errors.json'), JSON.stringify(errors, null, 2))
      await writeFile(resolve(shots, 'startup-body.txt'), await page.locator('body').innerText())
      throw error
    }
    await writeFile(resolve(shots, 'boot-aria.txt'), await page.locator('body').ariaSnapshot())
    await page.screenshot({ path: resolve(shots, 'boot.png') })
    await page.getByRole('button', { name: /^(Library|资料库)$/ }).click()
    const separator = page.getByRole('separator', { name: /^(Resize library directory|调整资料库目录宽度)$/ })
    await separator.waitFor()
    const directory = page.locator('section:has(> [role="separator"]) > aside')
    const content = page.locator('section:has(> [role="separator"]) > main')
    expect(await directory.evaluate(element => element.getBoundingClientRect().width)).toBe(280)
    const box = await separator.boundingBox()
    if (!box) throw new Error('Missing library divider')
    await page.mouse.move(box.x + box.width / 2, box.y + 180)
    expect(await separator.evaluate(element => getComputedStyle(element).cursor)).toBe('col-resize')
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + 180, { steps: 12 })
    await page.mouse.up()
    expect(await directory.evaluate(element => element.getBoundingClientRect().width)).toBe(400)
    expect(await page.evaluate(() => localStorage.getItem('mmp.library.navigation.width'))).toBe('400')
    await page.screenshot({ path: resolve(shots, 'light-resized.png') })
    await page.reload({ waitUntil: 'load' })
    await page.getByRole('button', { name: /^(Library|资料库)$/ }).click()
    await separator.waitFor()
    expect(await directory.evaluate(element => element.getBoundingClientRect().width)).toBe(400)
    await separator.focus()
    await page.keyboard.press('Home')
    expect(await directory.evaluate(element => element.getBoundingClientRect().width)).toBe(200)
    await page.keyboard.press('End')
    expect(await directory.evaluate(element => element.getBoundingClientRect().width)).toBe(480)
    await page.setViewportSize({ width: 900, height: 900 })
    await expect.poll(() => content.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(320)
    const visibleWidth = await directory.evaluate(element => element.getBoundingClientRect().width)
    await expect.poll(() => separator.getAttribute('aria-valuenow')).toBe(String(Math.round(visibleWidth)))
    await separator.focus()
    await page.keyboard.press('ArrowLeft')
    expect(await directory.evaluate(element => element.getBoundingClientRect().width)).toBe(visibleWidth - 16)
    await page.evaluate(() => { document.body.setAttribute('data-ds-dark-theme', '') })
    await separator.hover()
    await page.screenshot({ path: resolve(shots, 'dark-narrow.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(() => separator.isVisible()).toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: resolve(shots, 'mobile.png') })
  } finally {
    await browser.close()
    await scaffold.close()
  }
}, 180_000)
