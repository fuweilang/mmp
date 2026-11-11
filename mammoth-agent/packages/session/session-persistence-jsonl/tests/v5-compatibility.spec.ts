/** Header refusal and admission before recovery for the V5 successor. */
import { Context } from '@mammoth-ai/cordis'
import { SESSION_FORMAT_VERSION, SessionId, SessionSeq } from '@mammoth-ai/mmp-session'
import * as Jsonl from '@mammoth-ai/mmp-session-persistence-jsonl'
import { mkdtemp, mkdir, readFile, writeFile, stat, rm, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { generationLogPath } from '../src/format.ts'
import { compressZstdFrame } from '../src/zstd.ts'

describe('V5 compatibility refusal', () => {
  it('advances the only current writer to five', () => { expect(SESSION_FORMAT_VERSION).toBe(5) })
  it.each(['none', 'zstd'] as const)('refuses unknown required rows after corrupt prefixes without changing %s bytes', async (compression) => {
    const root = await mkdtemp(join(tmpdir(), 'mmp-v5-admission-'))
    const id = SessionId('required-after-corruption')
    const path = generationLogPath(root, undefined, id, SESSION_FORMAT_VERSION, compression)
    const header = { type: 'session', version: SESSION_FORMAT_VERSION, id, createdAt: 1, isSeeded: false, delegationDepth: 0 }
    const raw = Buffer.from(JSON.stringify(header) + '\nnot-json\n' + JSON.stringify({ type: 'future/required', seq: 0, time: 2, data: {} }) + '\n')
    const bytes = compression === 'none' ? raw : Buffer.concat([await compressZstdFrame(Buffer.from(JSON.stringify(header) + '\n')), await compressZstdFrame(raw.subarray(Buffer.byteLength(JSON.stringify(header) + '\n')))])
    const ctx = new Context()
    try {
      await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes)
      const before = await stat(path)
      await ctx.plugin(Jsonl, { root, compression })
      for (const access of ['read', 'write'] as const) {
        const read = async () => {
          const handle = await ctx.sessionPersistence.open(id, access)
          try { await handle.read() } finally { await handle.close() }
        }
        await expect(read()).rejects.toThrow(/unknown.*required|unknown to this harness/)
        expect(await readFile(path)).toEqual(bytes)
        expect((await stat(path)).ino).toBe(before.ino)
      }
    } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
  })
})

it.each(['none', 'zstd'] as const)('publishes verified V5 before append and retains V4 bytes/path/inode for %s', async (compression) => {
  const root = await mkdtemp(join(tmpdir(), 'mmp-v4-publication-'))
  const id = SessionId('v4-rag-source')
  const sourcePath = generationLogPath(root, undefined, id, 4, compression)
  const currentPath = generationLogPath(root, undefined, id, 5, compression)
  const header = { type: 'session', version: 4, id, createdAt: 1, isSeeded: false, delegationDepth: 0 }
  const evidence = { type: 'official-agent/knowledge', seq: 0, time: 2, data: { evidence: [{ nodeId: 'node', versionId: 'version', text: 'exact local evidence' }] } }
  const headerLine = Buffer.from(JSON.stringify(header) + '\n')
  const body = Buffer.from(JSON.stringify(evidence) + '\n')
  const bytes = compression === 'none' ? Buffer.concat([headerLine, body]) : Buffer.concat([await compressZstdFrame(headerLine), await compressZstdFrame(body)])
  const ctx = new Context()
  try {
    await mkdir(dirname(sourcePath), { recursive: true }); await writeFile(sourcePath, bytes)
    const before = await stat(sourcePath)
    const digest = createHash('sha256').update(bytes).digest('hex')
    await ctx.plugin(Jsonl, { root, compression })
    const reader = await ctx.sessionPersistence.open(id, 'read')
    try { expect(reader.header.version).toBe(5); expect((await reader.read()).events).toEqual([evidence]) } finally { await reader.close() }
    expect(await readdir(dirname(sourcePath))).toEqual([sourcePath.split('/').at(-1)])
    const writer = await ctx.sessionPersistence.open(id, 'write')
    try {
      expect(writer.header.version).toBe(5)
      expect((await stat(currentPath)).size).toBeGreaterThan(0)
      expect((await writer.read()).events).toEqual([evidence])
      await writer.append([{ type: 'turn/start', seq: SessionSeq(1), time: 3, data: { turn: 1 } }])
      await writer.flush()
    } finally { await writer.close() }
    const reopened = await ctx.sessionPersistence.open(id, 'read')
    try {
      expect((await reopened.read()).events).toHaveLength(2)
      expect(reopened.header.version).toBe(5)
    } finally { await reopened.close() }
    expect(createHash('sha256').update(await readFile(sourcePath)).digest('hex')).toBe(digest)
    expect(await stat(sourcePath)).toMatchObject({ ino: before.ino, dev: before.dev, size: before.size })
    // Selected V5 corruption cannot trigger fallback to the still-valid V4 predecessor.
    await writeFile(currentPath, compression === 'none' ? 'invalid header\n' : await compressZstdFrame(Buffer.from('invalid header\n')))
    await expect(ctx.sessionPersistence.open(id, 'write')).rejects.toThrow()
    expect(await readFile(sourcePath)).toEqual(bytes)
    expect((await stat(sourcePath)).ino).toBe(before.ino)
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})
