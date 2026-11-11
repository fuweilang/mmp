import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@mammoth-ai/cordis'
import Skills from '@mammoth-ai/mmp-skill'
import { GroundOfficialAgentClient } from '../src/ground.ts'
import { skillPackageDigest, validateCompleteSkill, COMPLETE_SKILL_LIMITS } from '../src/skill-package-format.ts'
import { installOfficialGallerySkills } from '../src/skill-provider.ts'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const summary = { id: 'skill-one', key: 'complete', name: 'Complete', summary: 'Fixture', category: null, packageRevision: 2, enabledAt: '2026-11-10' }

async function fixture(options: { changeFile?: boolean; badDigest?: boolean; largeStream?: boolean; onResource?: () => Promise<void>; onContent?: () => Promise<void>; largeManifest?: boolean } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'skill-host-'))
  cleanups.push(() => rm(workspace, { recursive: true, force: true }))
  const data: Record<string, Uint8Array> = {
    'SKILL.md': Buffer.from('---\nname: complete\ndescription: fixture\n---\nRead references/guide.md and run scripts/run.sh.'),
    'scripts/run.sh': Buffer.from('#!/bin/sh\nprintf SCRIPT_OK'),
    'references/guide.md': Buffer.from('# GUIDE_OK'),
    'assets/data.bin': Buffer.from([0, 255, 128, 2]),
    'resources/原路径.txt': Buffer.from('RESOURCE_OK'),
  }
  const files = Object.entries(data).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, bytes]) => ({
    path, bytes: bytes.length, sha256: hash(bytes), executable: path === 'scripts/run.sh',
  }))
  const content = {
    id: summary.id, key: summary.key, name: summary.name, summary: summary.summary, packageRevision: 2,
    instruction: Buffer.from(data['SKILL.md']!).toString(), packageFormat: 2, files,
    packageDigest: options.badDigest ? '0'.repeat(64) : hash(JSON.stringify(files.map(f => [f.path, f.bytes, f.sha256, f.executable]))),
    limits: { maxFiles: 500, maxTotalBytes: 10485760, maxInstructionBytes: 102400 },
  }
  if (options.largeManifest) {
    content.instruction = '# Entry\n' + '\u0001'.repeat(100000)
    content.files = [{ path: 'SKILL.md', bytes: Buffer.byteLength(content.instruction), sha256: hash(content.instruction), executable: false }, ...Array.from({ length: 499 }, (_, i) => ({ path: Array.from({ length: 6 }, () => '中'.repeat(80)).join('/') + String(i), bytes: 0, sha256: hash(''), executable: false }))]
    content.packageDigest = skillPackageDigest(content.files)
  }
  let downloads = 0, negotiated = false
  const client = new GroundOfficialAgentClient('https://fixture.invalid', async () => 'fixture-token', async input => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/content')) {
      await options.onContent?.()
      negotiated = url.searchParams.get('packageFormat') === '2'
      return new Response(JSON.stringify(content), { headers: { 'content-type': 'application/json' } })
    }
    downloads++
    await options.onResource?.()
    const path = url.searchParams.get('path')!
    if (options.largeStream) return new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4096)); c.close() } }))
    return new Response(options.changeFile && path === 'assets/data.bin' ? new Uint8Array([1, 2, 3, 4]) : Uint8Array.from(data[path]!))
  })
  const ctx = new Context()
  await ctx.plugin(Skills)
  const invalidate = installOfficialGallerySkills(ctx, client, [summary])
  cleanups.push(() => ctx.fiber.dispose())
  const load = (cwd = workspace, signal?: AbortSignal) => ctx.skills.get(summary.key, { cwd, ...signal ? { signal } : {} })
  return { ctx, workspace, load, invalidate, data, content, client, downloads: () => downloads, negotiated: () => negotiated }
}

describe('complete package scoped skill provider', () => {
  it('negotiates v2 and makes every file available under the actual workspace', async () => {
    const f = await fixture(), skill = await f.load()
    expect(f.negotiated()).toBe(true)
    expect(skill?.content).toContain('run scripts/run.sh')
    expect(skill?.content).not.toContain('description: fixture')
    expect(skill?.resourceBase?.kind).toBe('directory')
    if (skill?.resourceBase?.kind !== 'directory') throw Error('missing directory')
    const root = skill.resourceBase.path
    expect(relative(await realpath(f.workspace), root).startsWith('.mmp/runtime/skill-packages/')).toBe(true)
    for (const [path, bytes] of Object.entries(f.data)) expect(await readFile(join(root, path))).toEqual(Buffer.from(bytes))
    if (process.platform !== 'win32') expect((await stat(join(root, 'scripts/run.sh'))).mode & 0o111).toBe(0o100)
    await f.load()
    expect(f.downloads()).toBe(5)
    await f.ctx.fiber.dispose()
    await expect(stat(root)).rejects.toThrow()
  })

  it('rebuilds modified source files and isolates a second workspace while preserving an old running copy', async () => {
    const f = await fixture(), first = await f.load()
    if (first?.resourceBase?.kind !== 'directory') throw Error('missing directory')
    const original = first.resourceBase.path
    await writeFile(join(original, 'references/guide.md'), 'modified')
    const second = await f.load()
    if (second?.resourceBase?.kind !== 'directory') throw Error('missing directory')
    expect(second.resourceBase.path).not.toBe(original)
    expect(await readFile(join(second.resourceBase.path, 'references/guide.md'), 'utf8')).toBe('# GUIDE_OK')
    expect(await readFile(join(original, 'references/guide.md'), 'utf8')).toBe('modified')
    const workspace2 = await mkdtemp(join(tmpdir(), 'skill-second-')); cleanups.push(() => rm(workspace2, { recursive: true, force: true }))
    const third = await f.load(workspace2)
    expect(third?.resourceBase).not.toEqual(second.resourceBase)
  })

  it.each([{ changeFile: true }, { badDigest: true }, { largeStream: true }])('rejects partial or corrupt package preparation %j', async options => {
    const f = await fixture(options)
    await expect(f.load()).rejects.toThrow(/hash|digest|integrity|byte|limit|checksum/i)
    const runtime = join(f.workspace, '.mmp/runtime/skill-packages')
    const owners = await readdir(runtime).catch(() => [])
    for (const owner of owners) expect(await readdir(join(runtime, owner))).toEqual([])
  })

  it('rejects symlinked managed roots instead of writing into their targets', async () => {
    const f = await fixture(), outside = await mkdtemp(join(tmpdir(), 'skill-outside-'))
    cleanups.push(() => rm(outside, { recursive: true, force: true }))
    await symlink(outside, join(f.workspace, '.mmp'), 'dir')
    await expect(f.load()).rejects.toThrow(/symlink|directory|path/i)
    expect(await readdir(outside)).toEqual([])
  })

  it('releases previous execution copies on selection invalidation and can prepare the next generation', async () => {
    const f = await fixture(), skill = await f.load()
    if (skill?.resourceBase?.kind !== 'directory') throw Error('missing directory')
    await f.invalidate()
    await expect(stat(skill.resourceBase.path)).rejects.toThrow()
    const next = await f.load()
    expect(next?.resourceBase).not.toEqual(skill.resourceBase)
  })

  it('accepts the largest legal serialized metadata envelope, including JSON escaping', async () => {
    const f = await fixture({ largeManifest: true })
    validateCompleteSkill(f.content, COMPLETE_SKILL_LIMITS)
    expect(Buffer.byteLength(JSON.stringify(f.content))).toBeGreaterThan(1048576)
    expect((await f.client.fetchSkillContent(summary.id, 2)).instruction).toBe(f.content.instruction)
  })

  it('cancels a lookup waiting for uncooperative content without downloading stale resources', async () => {
    let entered!: () => void, resume!: () => void
    const ready = new Promise<void>(r => { entered = r }), hold = new Promise<void>(r => { resume = r })
    const f = await fixture({ onContent: async () => { entered(); await hold } })
    const result = f.load().then(() => undefined, error => error)
    await ready
    await f.invalidate()
    expect(await result).toBeInstanceOf(Error)
    resume()
    await new Promise<void>(r => setImmediate(r))
    expect(f.downloads()).toBe(0)
    expect(await readdir(join(f.workspace, '.mmp/runtime/skill-packages')).catch(() => [])).toEqual([])
  })

  it('joins every older cleanup when invalidated again before resource IO settles', async () => {
    let entered!: () => void, resume!: () => void
    const ready = new Promise<void>(r => { entered = r }), hold = new Promise<void>(r => { resume = r })
    const f = await fixture({ onResource: async () => { entered(); await hold } })
    const result = f.load().catch(error => error)
    await ready
    const first = f.invalidate()
    let done = false
    const second = f.invalidate().then(() => { done = true })
    await new Promise(r => setTimeout(r, 10))
    const early = done
    resume()
    await Promise.all([first, second, result])
    expect(early).toBe(false)
    expect(await readdir(join(f.workspace, '.mmp/runtime/skill-packages')).catch(() => [])).toEqual([])
  })

  it('cancels preparation and disposal waits for cleanup before reporting a usable package', async () => {
    let entered!: () => void, resume!: () => void
    const ready = new Promise<void>(r => { entered = r }), hold = new Promise<void>(r => { resume = r })
    const f = await fixture({ onResource: async () => { entered(); await hold } }), controller = new AbortController()
    const result = f.load(f.workspace, controller.signal)
    await ready
    controller.abort()
    resume()
    await expect(result).rejects.toThrow()
    await f.ctx.fiber.dispose()
    const owners = await readdir(join(f.workspace, '.mmp/runtime/skill-packages')).catch(() => [])
    expect(owners).toEqual([])
  })
})
