/** Workspace-owned, verified execution copies of complete managed skill revisions. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { GroundOfficialAgentClient, GroundOfficialSkillContent } from './ground.ts'
import { COMPLETE_SKILL_LIMITS, validateCompleteSkill, type SkillPackageFile, type SkillPackageLimits } from './skill-package-format.ts'

type CompleteContent = Extract<GroundOfficialSkillContent, { packageFormat: 2 }>
interface OwnedDirectory { path: string; ino: number; dev: number }

async function realDirectory(path: string): Promise<void> {
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(path) !== path) throw new Error('Skill package directory path is symlinked or unavailable')
}

async function ensureDirectory(root: string, relative: string): Promise<string> {
  await realDirectory(root)
  let path = root
  for (const part of relative.split('/').filter(Boolean)) {
    path = join(path, part)
    try { await mkdir(path, { mode: 0o700 }) }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error }
    await realDirectory(path)
  }
  return path
}

async function owned(path: string): Promise<OwnedDirectory> {
  await realDirectory(path)
  const info = await lstat(path)
  return { path, ino: info.ino, dev: info.dev }
}

async function removeOwned(directory: OwnedDirectory): Promise<void> {
  let info
  try { info = await lstat(directory.path) }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return; throw error }
  if (info.ino !== directory.ino || info.dev !== directory.dev) throw new Error('Skill package cleanup directory was replaced')
  await realDirectory(directory.path)
  await rm(directory.path, { recursive: true, force: true })
}

async function unchanged(directory: string, files: readonly SkillPackageFile[], signal: AbortSignal): Promise<boolean> {
  try {
    await realDirectory(directory)
    for (const file of files) {
      signal.throwIfAborted()
      const path = join(directory, ...file.path.split('/')), info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink() || info.size !== file.bytes || await realpath(path) !== path) return false
      if (process.platform !== 'win32' && Boolean(info.mode & 0o111) !== file.executable) return false
      const hash = createHash('sha256')
      let bytes = 0
      for await (const chunk of createReadStream(path, { signal })) {
        bytes += chunk.length
        if (bytes > file.bytes) return false
        hash.update(chunk)
      }
      if (bytes !== file.bytes || hash.digest('hex') !== file.sha256) return false
    }
    return true
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof Error && 'code' in error && ['ENOENT', 'ENOTDIR', 'ELOOP'].includes(String(error.code))) return false
    throw error
  }
}

/** One Provider owns execution copies and joins all pending work before disposal. */
export class CompleteSkillPackages {
  private readonly control = new AbortController()
  private readonly cache = new Map<string, string>()
  private readonly owners = new Map<string, Promise<OwnedDirectory>>()
  private readonly directories = new Map<string, OwnedDirectory>()
  private readonly pending = new Set<Promise<string>>()

  constructor(private readonly limits: SkillPackageLimits = COMPLETE_SKILL_LIMITS) {}

  /**
   * Prepare a frozen revision in the current physical workspace; failures never publish cache entries.
   * @param payload - validated complete revision and original instruction.
   * @param ground - authenticated resource client.
   * @param cwd - selected workspace, required for complete packages.
   * @param caller - cancellation for this lookup.
   * @returns the fully verified execution directory.
   */
  async prepare(payload: CompleteContent, ground: GroundOfficialAgentClient, cwd: string | undefined, caller?: AbortSignal): Promise<string> {
    const signal = AbortSignal.any([this.control.signal, ...caller ? [caller] : []])
    signal.throwIfAborted()
    const operation = this.load(payload, ground, cwd, signal)
    this.pending.add(operation)
    try { return await operation } finally { this.pending.delete(operation) }
  }

  private async load(payload: CompleteContent, ground: GroundOfficialAgentClient, cwd: string | undefined, signal: AbortSignal): Promise<string> {
    validateCompleteSkill(payload, this.limits)
    if (!cwd) throw new Error('Choose an existing workspace to load this complete skill package')
    const workspace = await realpath(cwd)
    await realDirectory(workspace)
    signal.throwIfAborted()
    const key = JSON.stringify([workspace, payload.id, payload.packageRevision, payload.packageDigest]), cached = this.cache.get(key)
    if (cached && await unchanged(cached, payload.files, signal)) return cached
    this.cache.delete(key)
    let owner = this.owners.get(workspace)
    if (!owner) {
      owner = (async () => {
        const base = await ensureDirectory(workspace, '.mmp/runtime/skill-packages')
        return owned(await mkdtemp(join(base, 'owner-')))
      })()
      this.owners.set(workspace, owner)
      // Only successful reservations are reusable; a repaired ancestor must be retriable.
      const reservation = owner
      void reservation.catch(() => {
        if (this.owners.get(workspace) === reservation) this.owners.delete(workspace)
      })
    }
    const parent = await owner
    signal.throwIfAborted()
    await realDirectory(parent.path)
    const directory = await owned(await mkdtemp(join(parent.path, 'load-')))
    this.directories.set(directory.path, directory)
    const operation = new AbortController(), combined = AbortSignal.any([signal, operation.signal])
    let cursor = 0
    const workers = Array.from({ length: Math.min(4, payload.files.length) }, async () => {
      try {
        for (;;) {
          combined.throwIfAborted()
          const file = payload.files[cursor++]
          if (!file) return
          const bytes = await ground.fetchSkillResource(payload.id, payload.packageRevision, file.path, combined, file.bytes)
          combined.throwIfAborted()
          if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Skill package file integrity mismatch: ${file.path}`)
          const target = join(directory.path, ...file.path.split('/'))
          await ensureDirectory(directory.path, file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '')
          combined.throwIfAborted()
          await writeFile(target, bytes, { flag: 'wx', mode: file.executable ? 0o700 : 0o600 })
          await realDirectory(dirname(target))
        }
      } catch (error) { operation.abort(error); throw error }
    })
    const results = await Promise.allSettled(workers), failed = results.find(r => r.status === 'rejected')
    try {
      if (failed?.status === 'rejected') throw failed.reason
      signal.throwIfAborted()
      if (!await unchanged(directory.path, payload.files, signal)) throw new Error('Skill package integrity changed during preparation')
      signal.throwIfAborted()
      this.cache.set(key, directory.path)
      return directory.path
    } catch (error) {
      await removeOwned(directory)
      this.directories.delete(directory.path)
      throw error
    }
  }

  /** Cancel active preparations and remove only directories still owned by this Provider. */
  async dispose(): Promise<void> {
    this.control.abort()
    await Promise.allSettled([...this.pending])
    const results = await Promise.allSettled([...this.directories.values()].map(removeOwned))
    const owners = await Promise.allSettled([...this.owners.values()])
    for (const owner of owners) if (owner.status === 'fulfilled') await removeOwned(owner.value)
    this.cache.clear(); this.directories.clear(); this.owners.clear()
    const failed = results.find(r => r.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  }
}
