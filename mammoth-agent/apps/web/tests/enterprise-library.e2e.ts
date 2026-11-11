/** Real Ground login/DB/Host/composer/persistence; only the model response is deterministic replay. */
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright'
import { expect, it } from 'vitest'
import type { SessionEvent } from '@mammoth-ai/mmp-session'
import { launchWebScaffold, readPersistedEvents, watchConsole, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace } from './support.ts'

type Item = { id: string; currentVersion: { id: string } }
type Fixture = {
  origin: string
  browserCookie(who: string): string
  upload(who: string, name: string, content: string | Uint8Array, replacement?: string): Promise<{ body: { items: Item[] } }>
  request(who: string, path: string, method?: string, body?: object): Promise<{ status: number }>
}
const require = createRequire(import.meta.url)
const { withLibraryHttpFixture } = require('../../../../ground/apps/backend/test/library/library.http-fixture.cjs') as {
  withLibraryHttpFixture(work: (fixture: Fixture) => Promise<void>): Promise<void>
}
const eventText = (event: SessionEvent): string => {
  const blocks = event.type === 'user/message' ? event.data.content
    : event.type === 'assistant/message' ? event.data.message.content : []
  return blocks.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
}

it('sends two chosen real sources once, persists their fixed versions, and reauthorizes source links after reopen', async () => {
  await withLibraryHttpFixture(async ground => {
    const directory = await mkdtemp(join(tmpdir(), 'mmp-library-session-'))
    const browser = await chromium.launch()
    let host: WebScaffold | undefined
    let page: Page | undefined
    const failures: unknown[] = []
    try {
      const first = (await ground.upload('owner', 'Evidence A.md', 'ALPHA stored version one')).body.items[0]!
      const second = (await ground.upload('owner', 'Evidence B.md', 'BETA second source')).body.items[0]!
      // Literal 64x64 RGB PNG: the browser must decode the protected original, not just render an image element.
      await ground.upload('owner','Pixel.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeklEQVR4nO3PUQkAIBTAwBfGfIY1kSH8OITBAtxm7fN1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWPHYBxSRBS0uR3UAAAAAASUVORK5CYII=','base64'))
      const source = `/ground-library/nodes/${first.id}/source?versionId=${first.currentVersion.id}&locator=paragraph%3A1`
      const response = `The supplied evidence is ALPHA and BETA. [Stored source](${source})`
      const overlay = join(directory, 'ground.patch.yml')
      await writeFile(overlay, JSON.stringify([
        { id: 'deepseek-account', config: { authMode: 'oidc', platformOrigin: ground.origin, inferenceOrigin: ground.origin,
          allowLoopbackHttp: true, webSso: true, groundCookieName: 'library_http_fixture', historySync: false } },
        { id: 'llm-ground', disabled: true },
      ]))
      const replay = join(directory, 'replay.override.json')
      await writeFile(replay, JSON.stringify([{ kind:'chunks', chunks:[
        {type:'block-start',index:0,blockType:'text'}, {type:'text-delta',index:0,text:response},
        {type:'block-end',index:0,block:{type:'text',text:response}}, {type:'finish',reason:{kind:'stop'}},
      ] }]))
      host = await launchWebScaffold({ groundSessionCookie:ground.browserCookie('owner'), extraOverlayPath:overlay, replayFixture:join(directory,'override-only.jsonl'), replayOverride:replay })
      await host.ctx.settings.update('locale', { preference:'en' })
      const context = await browser.newContext({ locale:'en-US' })
      const rawCookie = ground.browserCookie('owner'), separator = rawCookie.indexOf('=')
      await context.addCookies([{ name:rawCookie.slice(0,separator), value:rawCookie.slice(separator+1), url:host.baseUrl, httpOnly:true, sameSite:'Lax' }])
      page = await context.newPage()
      const console = watchConsole(page)
      await page.goto(host.baseUrl, {waitUntil:'load'})
      await page.waitForSelector('[class*="frame"]',{timeout:30000})
      await connectFreshWorkspace(page,host.workspaceCwd,'library-session')
      await page.getByRole('button', { name: 'Add files or run commands', exact: true }).click()
      await page.getByRole('option', { name: /^Library/ }).click()
      const picker = page.getByRole('dialog', { name: 'Select library files', exact: true })
      await picker.getByRole('tab', { name: 'My files', exact: true }).click()
      await picker.getByRole('checkbox', { name: 'Select Evidence A.md', exact: true }).check()
      await picker.getByRole('checkbox', { name: 'Select Evidence B.md', exact: true }).check()
      expect(await picker.getByRole('checkbox', { name: 'Select Pixel.png', exact: true }).isDisabled()).toBe(true)
      await picker.getByRole('button', { name: 'Add to conversation', exact: true }).click()
      await picker.waitFor({ state: 'detached' })
      const composer = page.locator('[data-composer-input][contenteditable="true"]').last()
      await composer.press('Home'); await composer.pressSequentially('Summarize both sources. ')
      expect(await composer.textContent()).toContain('Evidence A.md')
      const selectedVersion = first.currentVersion.id
      await ground.upload('owner','Evidence A.md','ALPHA replacement version two',first.id)
      expect((await ground.request('owner',`nodes/${second.id}/recycle`,'POST')).status).toBe(201)
      await page.getByRole('button',{name:'Send message',exact:true}).click()
      await page.getByRole('alert').filter({hasText:'回收站'}).waitFor()
      expect(await composer.textContent()).toContain('Summarize both sources.')
      expect(await composer.textContent()).toContain('Evidence A.md')
      expect(await composer.textContent()).toContain('Evidence B.md')
      const pendingSessions = host.ctx.sessions.list()
      expect(pendingSessions).toHaveLength(1)
      await host.ctx.sessions.flush(pendingSessions[0]!)
      expect((await readPersistedEvents(host,pendingSessions[0]!.id)).filter(event=>event.type==='user/message')).toHaveLength(0)
      expect((await ground.request('owner',`nodes/${second.id}/restore`,'POST')).status).toBe(201)
      const settled = host.whenTurnSettled(45000)
      await page.getByRole('button',{name:'Send message',exact:true}).click()
      const sessionId = await settled
      const link = page.getByRole('button',{name:'Stored source',exact:true})
      await link.waitFor({timeout:15000}); await link.click()
      const library = page.getByRole('main', { name: 'Preview', exact: true })
      await library.getByRole('heading', { name: 'Evidence A.md', exact: true }).waitFor(); expect(await library.textContent()).toContain('ALPHA stored version one')
      expect(await library.textContent()).toContain('v1'); expect(await library.textContent()).not.toContain('replacement version two')
      for (const viewport of [{width:1440,height:900},{width:1024,height:768}]) {
        await page.setViewportSize(viewport)
        await expect.poll(async()=>{
          const box=await library.boundingBox()
          return box!==null && box.x>=0 && box.y>=0 && box.x+box.width<=viewport.width && box.y+box.height<=viewport.height
        }).toBe(true)
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      }
      await library.getByRole('button',{name:'Close',exact:true}).last().click()
      const events = await readPersistedEvents(host,sessionId)
      const user = events.filter(event=>event.type==='user/message' && event.data.source.kind==='user')
      expect(user).toHaveLength(1)
      expect(eventText(user[0]!)).toContain(selectedVersion); expect(eventText(user[0]!)).toContain(second.currentVersion.id)
      expect(eventText(user[0]!)).toContain('ALPHA stored version one'); expect(eventText(user[0]!)).toContain('BETA second source')
      expect(eventText(user[0]!)).not.toContain('replacement version two')
      expect(events.some(event=>event.type==='assistant/message' && eventText(event).includes(source))).toBe(true)
      await page.reload({waitUntil:'load'})
      await page.getByRole('button',{name:'Stored source',exact:true}).waitFor({timeout:20000})
      await page.getByRole('button',{name:'Stored source',exact:true}).click()
      await library.getByRole('heading', { name: 'Evidence A.md', exact: true }).waitFor(); expect(await library.textContent()).toContain('ALPHA stored version one')
      await library.getByRole('button',{name:'Close',exact:true}).last().click()
      expect((await ground.request('owner',`nodes/${first.id}/recycle`,'POST')).status).toBe(201)
      await page.getByRole('treeitem').filter({hasText:'Summarize both sources.'}).click()
      await page.getByRole('button',{name:'Stored source',exact:true}).click()
      const alerts = page.getByRole('alert')
      await expect.poll(()=>alerts.allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('回收站')]))
      expect(await page.getByRole('dialog').count()).toBe(0)
      await page.locator('aside').getByRole('button', { name: 'Pixel.png', exact: true }).click()
      await library.getByRole('heading', { name: 'Pixel.png', exact: true }).waitFor()
      await expect.poll(() => library.getByRole('img', { name: 'Pixel.png', exact: true }).evaluate(image => ({ width: (image as HTMLImageElement).naturalWidth, height: (image as HTMLImageElement).naturalHeight }))).toEqual({ width: 64, height: 64 })
      expect(console.pageErrors).toEqual([])
      await context.close()
    } catch (error) {
      failures.push(error)
      if (page) console.error('Library acceptance page:', await page.locator('body').innerText().catch(()=>'<page closed>'))
    } finally {
      await browser.close().catch((error:unknown)=>failures.push(error))
      await host?.close().catch((error:unknown)=>failures.push(error))
      await rm(directory,{recursive:true,force:true}).catch((error:unknown)=>failures.push(error))
      if (failures.length === 1) throw failures[0]
      if (failures.length > 1) throw new AggregateError(failures,'Library acceptance and cleanup failed')
    }
  })
},120000)

it('shows enterprise-entry guidance for a real platform login without listing files or offering empty-library uploads', async () => {
  await withLibraryHttpFixture(async ground => {
    const directory = await mkdtemp(join(tmpdir(), 'mmp-library-platform-'))
    const browser = await chromium.launch()
    let host: WebScaffold | undefined
    try {
      const overlay = join(directory, 'ground.patch.yml')
      await writeFile(overlay, JSON.stringify([
        { id: 'deepseek-account', config: { authMode: 'oidc', platformOrigin: ground.origin, inferenceOrigin: ground.origin,
          allowLoopbackHttp: true, webSso: true, groundCookieName: 'library_http_fixture', historySync: false } },
        { id: 'llm-ground', disabled: true },
      ]))
      host = await launchWebScaffold({ groundSessionCookie: ground.browserCookie('platform'), extraOverlayPath: overlay })
      await host.ctx.settings.update('locale', { preference: 'zh' })
      const context = await browser.newContext({ locale: 'zh-CN' })
      const cookie = ground.browserCookie('platform'), separator = cookie.indexOf('=')
      await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: host.baseUrl, httpOnly: true, sameSite: 'Lax' }])
      const page = await context.newPage(), requests: string[] = []
      const console = watchConsole(page)
      page.on('request', request => { if (request.url().includes('/ground-library/')) requests.push(request.url()) })
      await page.goto(host.baseUrl, { waitUntil: 'load' })
      await page.getByRole('button', { name: '资料库', exact: true }).click()
      const guidance = page.getByRole('alert').filter({ hasText: '资料库属于企业能力' })
      await guidance.waitFor()
      for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
        await page.setViewportSize(viewport)
        expect(await page.getByRole('alert').count()).toBe(1)
        expect(await page.getByRole('heading', { name: '这里还没有资料', exact: true }).count()).toBe(0)
        expect(await page.getByRole('button', { name: '新建 · 我的资料', exact: true }).isDisabled()).toBe(true)
        expect(await page.getByRole('button', { name: '新建 · 企业共享', exact: true }).isDisabled()).toBe(true)
        expect(await page.getByRole('button', { name: '上传文件', exact: true }).count()).toBe(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        if (process.env.LIBRARY_UI_EVIDENCE_DIR) {
          await mkdir(process.env.LIBRARY_UI_EVIDENCE_DIR, { recursive: true })
          await page.screenshot({ path: join(process.env.LIBRARY_UI_EVIDENCE_DIR, `platform-no-tenant-${viewport.width}.png`) })
        }
      }
      expect(requests.every(url => url.endsWith('/config'))).toBe(true)
      const count = requests.length
      await page.getByRole('button', { name: '刷新', exact: true }).click()
      await expect.poll(() => requests.length).toBe(count + 1)
      await guidance.waitFor()
      expect(requests.every(url => url.endsWith('/config'))).toBe(true)
      expect(console.pageErrors).toEqual([])
      await context.close()
    } finally {
      await browser.close()
      await host?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
}, 120000)
