import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@mammoth-ai/cordis'
import Skills from '@mammoth-ai/mmp-skill'
import { GroundOfficialAgentClient, type GroundOfficialSkillContent } from '../src/ground.ts'
import { skillPackageDigest } from '../src/skill-package-format.ts'
import { installOfficialGallerySkills } from '../src/skill-provider.ts'

type Complete = Extract<GroundOfficialSkillContent, { packageFormat: 2 }>
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const summary = { id: 'attack-skill', key: 'attack-fixture', name: 'Attack fixture', summary: 'Local fixture', category: null, packageRevision: 7, enabledAt: '2026-11-10' }
async function temporary() { const root = await mkdtemp(join(tmpdir(), 'skill-adversarial-')); cleanups.push(() => rm(root, { recursive: true, force: true })); return root }
async function fixture(options: { mutate?: (payload: Complete) => void; wire?: (payload: Complete) => unknown; resource?: (path: string, bytes: Uint8Array) => Response | Promise<Response> } = {}) {
  const workspace = await temporary()
  const data: Record<string, Uint8Array> = {
    'SKILL.md': Buffer.from('# Local fixture\nRead references/guide.txt; run scripts/check.sh.'),
    'references/guide.txt': Buffer.from('ORIGINAL_GUIDE'),
    'scripts/check.sh': Buffer.from('#!/bin/sh\nprintf SAFE_FIXTURE'),
    'assets/empty.bin': new Uint8Array(),
  }
  const files = Object.entries(data).map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes), executable: path.endsWith('.sh') }))
  const payload: Complete = { id: summary.id, key: summary.key, name: summary.name, summary: summary.summary, packageRevision: 7, instruction: Buffer.from(data['SKILL.md']!).toString(), packageFormat: 2, files, packageDigest: skillPackageDigest(files), limits: { maxFiles: 500, maxTotalBytes: 10485760, maxInstructionBytes: 102400 } }
  options.mutate?.(payload)
  let downloads = 0
  const client = new GroundOfficialAgentClient('https://local-fixture.invalid', async () => 'fixture-only', async input => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/content')) return new Response(JSON.stringify(options.wire?.(payload) ?? payload))
    downloads++
    const path = url.searchParams.get('path')!, bytes = data[path] ?? new Uint8Array()
    return options.resource ? options.resource(path, bytes) : new Response(Uint8Array.from(bytes))
  })
  const ctx = new Context(); await ctx.plugin(Skills)
  const invalidate = installOfficialGallerySkills(ctx, client, [summary])
  cleanups.push(() => ctx.fiber.dispose())
  return { ctx, client, workspace, data, payload, invalidate, load: (cwd = workspace, signal?: AbortSignal) => ctx.skills.get(summary.key, { cwd, ...signal ? { signal } : {} }), downloads: () => downloads }
}
async function executionRoots(workspace: string) {
  const base = join(workspace, '.mmp/runtime/skill-packages')
  const owners = await readdir(base).catch(() => [])
  return (await Promise.all(owners.map(owner => readdir(join(base, owner))))).flat()
}
function rootOf(skill: Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>['load']>>) {
  if (skill?.resourceBase?.kind !== 'directory') throw Error('Missing prepared package')
  return skill.resourceBase.path
}

describe('adversarial complete package wire and lifecycle', () => {
  it.each(['../outside', '/absolute', 'assets/../outside', 'assets\\outside', 'assets/a:stream', 'assets/CON.txt', 'assets/end.', 'assets/e\u0301.txt', 'assets/' + 'a'.repeat(256), 'assets/' + '中'.repeat(86), 'assets/' + '😀'.repeat(64)])('rejects remote manifest path %j before downloading', async path => {
    const f = await fixture({ mutate: p => { p.files[1]!.path = path; p.packageDigest = skillPackageDigest(p.files) } })
    await expect(f.load()).rejects.toThrow()
    expect(f.downloads()).toBe(0)
    expect(await executionRoots(f.workspace)).toEqual([])
  })
  it.each(['case duplicate', 'file-directory conflict', 'missing entry', 'wrong instruction hash', 'wrong package digest', 'remote oversized limit', 'declared total overflow'])('rejects hostile metadata: %s', async attack => {
    const f = await fixture({ mutate: p => {
      if (attack === 'case duplicate') p.files.push({ ...p.files[1]!, path: 'REFERENCES/GUIDE.TXT' })
      if (attack === 'file-directory conflict') p.files.push({ ...p.files[1]!, path: 'references' })
      if (attack === 'missing entry') p.files = p.files.filter(file => file.path !== 'SKILL.md')
      if (attack === 'wrong instruction hash') p.instruction += 'TAMPERED'
      if (attack === 'remote oversized limit') p.limits.maxFiles = 501
      if (attack === 'declared total overflow') p.files[1]!.bytes = 10485760
      p.packageDigest = attack === 'wrong package digest' ? '0'.repeat(64) : skillPackageDigest(p.files)
    } })
    await expect(f.load()).rejects.toThrow()
    expect(f.downloads()).toBe(0)
  })
  it.each([{ id: 'another-id' }, { key: 'another-key' }, { packageRevision: 8 }, { packageFormat: 3 }])('rejects wrong response identity/format %j', async replacement => {
    const f = await fixture({ wire: p => ({ ...p, ...replacement }) })
    await expect(f.load()).rejects.toThrow()
    expect(f.downloads()).toBe(0)
  })
  it.each(['404', 'short', 'same-length corruption', 'extra-byte', 'oversized-header'])('never publishes a partial package after %s', async attack => {
    const f = await fixture({ resource: (path, bytes) => {
      if (path !== 'references/guide.txt') return new Response(Uint8Array.from(bytes))
      if (attack === '404') return new Response('missing', { status: 404 })
      if (attack === 'short') return new Response('short')
      if (attack === 'same-length corruption') return new Response('X'.repeat(bytes.length))
      if (attack === 'extra-byte') return new Response(Buffer.from(bytes).toString() + 'X')
      return new Response(Uint8Array.from(bytes), { headers: { 'content-length': '99999999' } })
    } })
    await expect(f.load()).rejects.toThrow()
    expect(await executionRoots(f.workspace)).toEqual([])
  })
  it.each(['a'.repeat(255), '中'.repeat(85), '😀'.repeat(63)])('prepares a supported filename byte boundary of %j', async name => {
    const f = await fixture({ mutate: p => { p.files.find(file => file.path === 'assets/empty.bin')!.path = 'assets/' + name; p.packageDigest = skillPackageDigest(p.files) } })
    const root = rootOf(await f.load())
    expect((await readFile(join(root, 'assets', name))).length).toBe(0)
  })
  it('accepts zero-byte files while exposing an actual verified canonical directory', async () => {
    const f = await fixture(), root = rootOf(await f.load())
    expect((await readFile(join(root, 'assets/empty.bin'))).length).toBe(0)
    expect(root.startsWith(join(await realpath(f.workspace), '.mmp/runtime/skill-packages/'))).toBe(true)
  })
  it('rebuilds after a source file is replaced with a symlink and leaves its target untouched', async () => {
    const f = await fixture(), first = rootOf(await f.load()), outside = await temporary(), target = join(outside, 'guide.txt')
    await writeFile(target, 'DO_NOT_TOUCH')
    await rm(join(first, 'references/guide.txt'))
    await symlink(target, join(first, 'references/guide.txt'))
    const second = rootOf(await f.load())
    expect(second).not.toBe(first)
    expect(await readFile(join(second, 'references/guide.txt'), 'utf8')).toBe('ORIGINAL_GUIDE')
    await f.invalidate()
    expect(await readFile(target, 'utf8')).toBe('DO_NOT_TOUCH')
  })
  it('can retry after a rejected symlinked ancestor is repaired', async () => {
    const f = await fixture(), outside = await temporary()
    await symlink(outside, join(f.workspace, '.mmp'), 'dir')
    await expect(f.load()).rejects.toThrow()
    await rm(join(f.workspace, '.mmp'))
    const root = rootOf(await f.load())
    expect(await readFile(join(root, 'references/guide.txt'), 'utf8')).toBe('ORIGINAL_GUIDE')
  })
  it('retries a repaired ancestor after concurrent failures and releases all recovered copies', async () => {
    const f = await fixture(), outside = await temporary()
    await symlink(outside, join(f.workspace, '.mmp'), 'dir')
    const failed = await Promise.allSettled(Array.from({ length: 8 }, () => f.load()))
    expect(failed.every(result => result.status === 'rejected')).toBe(true)
    await rm(join(f.workspace, '.mmp'))
    const recovered = await Promise.all(Array.from({ length: 8 }, () => f.load()))
    for (const skill of recovered) expect(await readFile(join(rootOf(skill), 'references/guide.txt'), 'utf8')).toBe('ORIGINAL_GUIDE')
    await f.invalidate()
    expect(await executionRoots(f.workspace)).toEqual([])
    expect(await readdir(outside)).toEqual([])
  })
  it('keeps twelve concurrent lookups consistent and cleans every allocated copy', async () => {
    const f = await fixture(), skills = await Promise.all(Array.from({ length: 12 }, () => f.load()))
    for (const skill of skills) expect(await readFile(join(rootOf(skill), 'references/guide.txt'), 'utf8')).toBe('ORIGINAL_GUIDE')
    await f.invalidate()
    expect(await executionRoots(f.workspace)).toEqual([])
  })
  it('cancels a streaming body mid-download and removes every partial directory', async () => {
    let entered!: () => void, cancelled = false, sent = false
    const ready = new Promise<void>(resolve => { entered = resolve })
    const f = await fixture({ resource: (path, bytes) => path !== 'references/guide.txt' ? new Response(Uint8Array.from(bytes)) : new Response(new ReadableStream<Uint8Array>({
      pull(controller) { if (!sent) { sent = true; controller.enqueue(new Uint8Array([1])); entered() } },
      cancel() { cancelled = true },
    })) })
    const control = new AbortController(), operation = f.load(f.workspace, control.signal).catch(error => error)
    await ready
    control.abort()
    expect(await operation).toBeInstanceOf(Error)
    expect(cancelled).toBe(true)
    // Skills.get races caller cancellation; invalidation is the joined cleanup boundary.
    await f.invalidate()
    expect(await executionRoots(f.workspace)).toEqual([])
  })
  it('rejects resource bodies that exceed the advertised size even when the header lies', async () => {
    const f = await fixture({ resource: (path, bytes) => path !== 'references/guide.txt' ? new Response(Uint8Array.from(bytes)) : new Response('X'.repeat(1024), { headers: { 'content-length': '0' } }) })
    await expect(f.load()).rejects.toThrow(/byte|limit/i)
    expect(await executionRoots(f.workspace)).toEqual([])
  })
  it('does not reuse a file directory belonging to a different provider scope', async () => {
    const a = await fixture(), b = await fixture(), ar = rootOf(await a.load()), br = rootOf(await b.load(a.workspace))
    expect(ar).not.toBe(br)
    await a.ctx.fiber.dispose()
    expect(await readFile(join(br, 'references/guide.txt'), 'utf8')).toBe('ORIGINAL_GUIDE')
  })
})
