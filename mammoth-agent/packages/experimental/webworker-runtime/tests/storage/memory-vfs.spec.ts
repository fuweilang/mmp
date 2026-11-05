/**
 * The identity, timestamp, link, mutation, and durability-sink guarantees
 * MemoryVfs owes its consumers, asserted directly rather than through the
 * `node:fs` bridge.
 *
 * `mmp-fs-local` builds a version token from `dev:ino:size:mtimeNs:ctimeNs` and
 * refuses a write whose token moved since it read. Two properties carry that:
 * `ino` identifies the entry at a path, and `mtimeMs` moves on every write. The
 * timestamp cases freeze the clock, because these writes are in memory and two
 * revisions routinely land in the same millisecond — a real-clock test passes
 * whether or not the strict increment exists.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryVfs } from '../../src/storage/memory.ts'
import type { VfsBigIntStats, VfsMutation, VfsMutationSink, VfsStats } from '../../src/storage/types.ts'

const identity = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).ino

const linkCount = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).nlink

const modified = (vfs: MemoryVfs, path: string): number => (vfs.statSync(path) as VfsStats).mtimeMs

afterEach(() => { vi.restoreAllMocks() })

describe('entry identity', () => {
  it('distinguishes paths and holds each identity across repeated stats', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/one.txt', 'one')
    vfs.seed('/mmp/two.txt', 'two')
    const first = identity(vfs, '/mmp/one.txt')
    expect(identity(vfs, '/mmp/two.txt')).not.toBe(first)
    expect(identity(vfs, '/mmp/one.txt')).toBe(first)
  })

  it('forgets the identities under a directory removed as a subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/skills/git/SKILL.md', '# git\n')
    const before = identity(vfs, '/mmp/skills/git/SKILL.md')
    vfs.rmSync('/mmp/skills', { recursive: true })
    vfs.seed('/mmp/skills/git/SKILL.md', '# git rebuilt\n')
    expect(identity(vfs, '/mmp/skills/git/SKILL.md')).not.toBe(before)
  })

  it('moves the source identity when a file replaces another path', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/from.txt', 'moved')
    vfs.seed('/mmp/to.txt', 'replaced')
    const [source, destination] = [identity(vfs, '/mmp/from.txt'), identity(vfs, '/mmp/to.txt')]
    vfs.renameSync('/mmp/from.txt', '/mmp/to.txt')
    const renamed = identity(vfs, '/mmp/to.txt')
    expect(vfs.readFileSync('/mmp/to.txt', 'utf8')).toBe('moved')
    expect([renamed === source, renamed === destination]).toEqual([true, false])
  })
})

describe('modification time', () => {
  it('hydrates explicit metadata without confusing timestamps with permission bits', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/restored', 'value', { mode: 0o600, mtimeMs: 1_600_000_000_000 })
    vfs.seedDirectory('/mmp/restored-directory', { mode: 0o700, mtimeMs: 1_600_000_000_001 })
    const stats = vfs.statSync('/mmp/restored') as VfsStats
    const directory = vfs.statSync('/mmp/restored-directory') as VfsStats
    expect([stats.mode & 0o777, stats.mtimeMs]).toEqual([0o600, 1_600_000_000_000])
    expect([directory.mode & 0o777, directory.mtimeMs]).toEqual([0o700, 1_600_000_000_001])
  })

  it('advances on every write even while the clock stands still', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/log.jsonl', 'first\n')
    const seeded = modified(vfs, '/mmp/log.jsonl')
    vfs.writeFileSync('/mmp/log.jsonl', 'second\n')
    const written = modified(vfs, '/mmp/log.jsonl')
    vfs.appendFileSync('/mmp/log.jsonl', 'third\n')
    const appended = modified(vfs, '/mmp/log.jsonl')
    vfs.truncateSync('/mmp/log.jsonl', 6)
    const truncated = modified(vfs, '/mmp/log.jsonl')
    expect([written > seeded, appended > written, truncated > appended]).toEqual([true, true, true])
    // One millisecond per revision: the increment is the minimum that separates
    // two tokens, not a coarser bump that would skew a real timestamp.
    expect(truncated - seeded).toBe(3)
  })

  it('takes the clock once the clock has passed the entry', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/log.jsonl', 'first\n')
    clock.mockReturnValue(1_700_000_005_000)
    vfs.writeFileSync('/mmp/log.jsonl', 'second\n')
    expect(modified(vfs, '/mmp/log.jsonl')).toBe(1_700_000_005_000)
  })

  it('extends truncation with zero bytes', async () => {
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/file', new Uint8Array([1, 2]))
    vfs.truncateSync('/mmp/file', 5)
    expect([...vfs.readFileSync('/mmp/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0])
    const handle = vfs.open('/mmp/file', 'r+')
    await handle.truncate(7)
    expect([...vfs.readFileSync('/mmp/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0, 0, 0])
  })

  it('advances a directory only when its immediate entry set changes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/mmp/workspace')
    const empty = modified(vfs, '/mmp/workspace')
    vfs.writeFileSync('/mmp/workspace/file.txt', 'one')
    const created = modified(vfs, '/mmp/workspace')
    vfs.writeFileSync('/mmp/workspace/file.txt', 'two')
    const rewritten = modified(vfs, '/mmp/workspace')
    vfs.rmSync('/mmp/workspace/file.txt')
    const removed = modified(vfs, '/mmp/workspace')
    expect([created > empty, rewritten === created, removed > rewritten]).toEqual([true, true, true])
  })
})

describe('mutation publication', () => {
  it('publishes only committed runtime changes and keeps image seeding silent', () => {
    const vfs = new MemoryVfs()
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.seed('/mmp/seeded.txt', 'seeded')
    expect(mutations).toEqual([])
    vfs.writeFileSync('/mmp/seeded.txt', 'changed')
    vfs.mkdirSync('/mmp/created')
    vfs.chmodSync('/mmp/created', 0o700)
    vfs.renameSync('/mmp/seeded.txt', '/mmp/renamed.txt')
    vfs.rmSync('/mmp/created', { recursive: true })
    expect(mutations.map(mutation => ({
      kind: mutation.kind,
      path: mutation.path,
      ...mutation.kind === 'write' ? { entryChanged: mutation.entryChanged } : {},
      ...mutation.kind === 'chmod' ? { mode: mutation.mode } : {},
    }))).toEqual([
      { kind: 'write', path: '/mmp/seeded.txt', entryChanged: false },
      { kind: 'mkdir', path: '/mmp/created' },
      { kind: 'chmod', path: '/mmp/created', mode: 0o700 },
      { kind: 'remove', path: '/mmp/seeded.txt' },
      { kind: 'write', path: '/mmp/renamed.txt', entryChanged: true },
      { kind: 'remove', path: '/mmp/created' },
    ])
    const renamed = mutations[4]
    expect(renamed?.kind === 'write' && new TextDecoder().decode(renamed.bytes)).toBe('changed')
    expect(() => { vfs.writeFileSync('/missing/file', 'no') }).toThrow(/ENOENT/)
    expect(mutations).toHaveLength(6)
  })

  it('contains a faulty observer and lets disposal stop later notifications', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/mmp')
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = vfs.subscribe(() => { throw new Error('observer failed') })
    const seen: string[] = []
    const second = vfs.subscribe((mutation) => { seen.push(mutation.path) })
    vfs.writeFileSync('/mmp/one', '1')
    first()
    second()
    vfs.writeFileSync('/mmp/two', '2')
    expect(seen).toEqual(['/mmp/one'])
    expect(reported).toHaveBeenCalledOnce()
  })

  it('feeds the same complete mutations to a durable sink and live subscribers', async () => {
    const recorded: VfsMutation[] = []
    let flushes = 0
    const sink: VfsMutationSink = {
      record: (mutation) => { recorded.push(mutation) },
      flush: async () => { flushes += 1 },
    }
    const vfs = new MemoryVfs({ sink })
    vfs.seedDirectory('/mmp')
    const observed: VfsMutation[] = []
    vfs.subscribe((mutation) => { observed.push(mutation) })
    vfs.writeFileSync('/mmp/log', 'a')
    vfs.appendFileSync('/mmp/log', 'bc')
    await vfs.flush()
    expect(observed).toEqual(recorded)
    expect(observed[0]).toBe(recorded[0])
    expect(recorded[0]).toMatchObject({ kind: 'write', path: '/mmp/log', mode: 0o644, entryChanged: true })
    expect(recorded[1]).toMatchObject({ kind: 'write', path: '/mmp/log', mode: 0o644, entryChanged: false, appendedFrom: 1 })
    expect(recorded[1]?.kind === 'write' && new TextDecoder().decode(recorded[1].bytes)).toBe('abc')
    expect(flushes).toBe(1)
  })

  it('publishes descriptor writes at the file identity current path', () => {
    const mutations: VfsMutation[] = []
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/source', 'old')
    const descriptor = vfs.openFileSync('/mmp/source', 'r+')
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.renameSync('/mmp/source', '/mmp/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('new'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/mmp/destination'])
    expect(vfs.readFileSync('/mmp/destination', 'utf8')).toBe('new')
    vfs.unlinkSync('/mmp/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('detached'))
    expect(mutations).toEqual([])
    expect(new TextDecoder().decode(descriptor.read(0, descriptor.stat().size))).toBe('detached')
  })

  it('reports the path identity through a BigInt file handle stat', async () => {
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/session.lock', '')
    const handle = vfs.open('/mmp/session.lock', 'w')
    const held = await handle.stat({ bigint: true }) as VfsBigIntStats
    const current = vfs.statSync('/mmp/session.lock', { bigint: true }) as VfsBigIntStats

    expect([held.dev, held.ino]).toEqual([current.dev, current.ino])
    await handle.chmod(0o600)
    expect((vfs.statSync('/mmp/session.lock') as VfsStats).mode & 0o777).toBe(0o600)
    await handle.close()
  })

  it('decomposes a directory rename into replayable destination state', () => {
    const recorded: VfsMutation[] = []
    const vfs = new MemoryVfs({
      sink: { record: (mutation) => { recorded.push(mutation) }, flush: () => Promise.resolve() },
    })
    vfs.seedDirectory('/mmp/staging/nested', { mode: 0o700 })
    vfs.seed('/mmp/staging/nested/file', 'value', { mode: 0o600 })
    vfs.renameSync('/mmp/staging', '/mmp/published')

    expect(recorded.map(mutation => [mutation.kind, mutation.path])).toEqual([
      ['remove', '/mmp/staging'],
      ['mkdir', '/mmp/published'],
      ['mkdir', '/mmp/published/nested'],
      ['write', '/mmp/published/nested/file'],
    ])
    expect(recorded[3]).toMatchObject({ kind: 'write', mode: 0o600, entryChanged: true })
    expect(recorded[3]?.kind === 'write' && new TextDecoder().decode(recorded[3].bytes)).toBe('value')
  })
})

describe('directory rename', () => {
  it('rejects file, non-empty directory, and missing-parent destinations before mutation', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/source/nested/file', 'source')
    vfs.seed('/mmp/file', 'destination')
    vfs.seed('/mmp/non-empty/child', 'destination')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    expect(() => { vfs.renameSync('/mmp/source', '/mmp/file') })
      .toThrow(expect.objectContaining({ code: 'ENOTDIR' }))
    expect(() => { vfs.renameSync('/mmp/source', '/mmp/non-empty') })
      .toThrow(expect.objectContaining({ code: 'ENOTEMPTY' }))
    expect(() => { vfs.renameSync('/mmp/source', '/missing/destination') })
      .toThrow(expect.objectContaining({ code: 'ENOENT' }))

    expect(vfs.readFileSync('/mmp/source/nested/file', 'utf8')).toBe('source')
    expect(vfs.readFileSync('/mmp/file', 'utf8')).toBe('destination')
    expect(vfs.readFileSync('/mmp/non-empty/child', 'utf8')).toBe('destination')
    expect(mutations).toEqual([])
  })

  it('replaces an empty directory with the source subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/mmp/source/nested', { mode: 0o700 })
    vfs.seed('/mmp/source/nested/file', 'source')
    vfs.seedDirectory('/mmp/destination', { mode: 0o711 })

    vfs.renameSync('/mmp/source', '/mmp/destination')

    expect(vfs.existsSync('/mmp/source')).toBe(false)
    expect(vfs.readFileSync('/mmp/destination/nested/file', 'utf8')).toBe('source')
    expect((vfs.statSync('/mmp/destination') as VfsStats).mode & 0o777).toBe(0o755)
    expect((vfs.statSync('/mmp/destination/nested') as VfsStats).mode & 0o777).toBe(0o700)
  })
})

describe('hard links', () => {
  it('shares identity, bytes, and mode until one name is removed', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/session.jsonl', 'committed\n')
    vfs.linkSync('/mmp/session.jsonl', '/mmp/session-latest.jsonl')
    vfs.linkSync('/mmp/session-latest.jsonl', '/mmp/session-archive.jsonl')
    expect(identity(vfs, '/mmp/session-latest.jsonl')).toBe(identity(vfs, '/mmp/session.jsonl'))
    expect(linkCount(vfs, '/mmp/session.jsonl')).toBe(3n)
    expect(vfs.readFileSync('/mmp/session-latest.jsonl', 'utf8')).toBe('committed\n')
    const changedPaths: string[] = []
    vfs.subscribe((mutation) => { changedPaths.push(mutation.path) })
    vfs.appendFileSync('/mmp/session.jsonl', 'appended\n')
    expect(changedPaths).toEqual([
      '/mmp/session.jsonl',
      '/mmp/session-latest.jsonl',
      '/mmp/session-archive.jsonl',
    ])
    expect(vfs.readFileSync('/mmp/session.jsonl', 'utf8')).toBe('committed\nappended\n')
    expect(vfs.readFileSync('/mmp/session-latest.jsonl', 'utf8')).toBe('committed\nappended\n')
    vfs.chmodSync('/mmp/session-latest.jsonl', 0o600)
    expect((vfs.statSync('/mmp/session.jsonl') as VfsStats).mode & 0o777).toBe(0o600)
    vfs.unlinkSync('/mmp/session-latest.jsonl')
    expect(linkCount(vfs, '/mmp/session.jsonl')).toBe(2n)
    vfs.unlinkSync('/mmp/session-archive.jsonl')
    expect(linkCount(vfs, '/mmp/session.jsonl')).toBe(1n)
    expect(vfs.readFileSync('/mmp/session.jsonl', 'utf8')).toBe('committed\nappended\n')
  })

  it('treats rename between names of the same node as a no-op', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/source', 'value')
    vfs.linkSync('/mmp/source', '/mmp/alias')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    vfs.renameSync('/mmp/source', '/mmp/alias')

    expect(vfs.readFileSync('/mmp/source', 'utf8')).toBe('value')
    expect(vfs.readFileSync('/mmp/alias', 'utf8')).toBe('value')
    expect(linkCount(vfs, '/mmp/source')).toBe(2n)
    expect(mutations).toEqual([])
  })

  it('retargets linked names through file replacement and directory moves', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/replacement', 'replacement')
    vfs.seed('/mmp/target', 'old')
    vfs.linkSync('/mmp/target', '/mmp/target-alias')
    const replaced = vfs.openFileSync('/mmp/target', 'r+')
    vfs.renameSync('/mmp/replacement', '/mmp/target')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    replaced.write(0, new TextEncoder().encode('changed'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/mmp/target-alias'])
    expect(vfs.readFileSync('/mmp/target', 'utf8')).toBe('replacement')
    expect(vfs.readFileSync('/mmp/target-alias', 'utf8')).toBe('changed')
    expect(linkCount(vfs, '/mmp/target-alias')).toBe(1n)

    vfs.seed('/mmp/tree/file', 'tree')
    vfs.linkSync('/mmp/tree/file', '/mmp/outside')
    const moved = vfs.openFileSync('/mmp/tree/file', 'r+')
    vfs.renameSync('/mmp/tree', '/mmp/moved')
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('moved'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/mmp/outside', '/mmp/moved/file'])
    expect(linkCount(vfs, '/mmp/moved/file')).toBe(2n)

    vfs.rmSync('/mmp/moved', { recursive: true })
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('kept!'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/mmp/outside'])
    expect(vfs.readFileSync('/mmp/outside', 'utf8')).toBe('kept!')
    expect(linkCount(vfs, '/mmp/outside')).toBe(1n)
  })

  it('rejects renaming a file over an existing directory', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/mmp/file', 'value')
    vfs.seedDirectory('/mmp/directory')
    expect(() => { vfs.renameSync('/mmp/file', '/mmp/directory') }).toThrow(expect.objectContaining({ code: 'EISDIR' }))
    expect(vfs.readFileSync('/mmp/file', 'utf8')).toBe('value')
    expect(vfs.statSync('/mmp/directory').isDirectory()).toBe(true)
  })
})
