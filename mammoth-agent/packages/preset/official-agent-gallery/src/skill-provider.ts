/**
 * Session-scoped SkillProvider for Ground-managed official skills.
 * Lists frozen summaries and prepares versioned package files on demand via Ground.
 */
import { CompleteSkillPackages } from './skill-package.ts'
import type { SkillPackageLimits } from './skill-package-format.ts'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@mammoth-ai/cordis'
import {
  isSkillName,
  type SkillCandidate,
  type SkillDefinition,
  type SkillLookupOptions,
  type SkillProvider,
} from '@mammoth-ai/mmp-skill'
import type { GroundOfficialAgentClient, GroundOfficialSkillContent } from './ground.ts'
import type { OfficialSkillSummary } from './types.ts'

/** Provider identity unique within one agent scope layer. */
export const OFFICIAL_GALLERY_SKILL_PROVIDER = 'official-gallery'

/** Lower ranks win within a layer; sit above bundled defaults. */
export const OFFICIAL_GALLERY_SKILL_RANK = 40

interface OfficialSkillLocator {
  readonly id: string
  readonly key: string
  readonly revision: number
  readonly displayName: string
}

// Detach a cancelled lookup even when an HTTP implementation ignores AbortSignal.
// Both promise branches remain observed; a late response cannot resume package preparation.
function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

function stripFrontmatter(raw: string): string {
  const match = /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u.exec(raw)
  return match === null ? raw.trim() : raw.slice(match[0].length).trim()
}

function catalogDescription(displayName: string, summary: string): string {
  const trimmed = summary.trim()
  if (trimmed === '') return displayName
  return trimmed.startsWith(displayName) ? trimmed : `${displayName}：${trimmed}`
}

/**
 * Register Ground official skills into the calling agent scope.
 * Bodies stay out of the initial catalog; `skill` / `/name` load via provider.get().
 * @param agentCtx - agent-scoped context (files into that scope layer).
 * @param ground - authenticated Ground client.
 * @param skills - frozen summaries for this Session only.
 * @param loaded - records an instruction after complete file preparation.
 * @param generation - current task selection generation.
 * @param packageLimits - local complete-package admission caps.
 * @returns invalidation that joins cleanup of the previous execution copies.
 */
export function installOfficialGallerySkills(
  agentCtx: Context,
  ground: GroundOfficialAgentClient,
  skills: readonly OfficialSkillSummary[] | (() => readonly OfficialSkillSummary[]),
  loaded?: (payload:GroundOfficialSkillContent,body:string,directory:string)=>void,
  generation?:()=>number|undefined,
  packageLimits?: SkillPackageLimits,
): () => Promise<void> {
  const skillsService = agentCtx.get('skills')
  if (skillsService === undefined) return async () => {}
  let invalidate = () => {}
  let clearPackages = async () => {}
  let lifecycle:AbortSignal|undefined
  const usable = () => (typeof skills === 'function' ? skills() : skills).filter(skill => isSkillName(skill.key))

  agentCtx.effect(function* () {
    const newState = () => ({
      control: new AbortController(),
      packages: new CompleteSkillPackages(packageLimits),
      materializations: new Map<string, string>(),
      pending: new Set<Promise<SkillDefinition | undefined>>(),
    })
    let state = newState()
    const retiring = new Set<Promise<void>>()
    const retire = async (previous: typeof state) => {
      previous.control.abort(new Error('GALLERY_STALE_SKILL_LOAD'))
      await Promise.allSettled([...previous.pending])
      await previous.packages.dispose()
      await Promise.all([...previous.materializations.values()].map(directory => rm(directory, { recursive: true, force: true })))
      previous.materializations.clear()
    }
    clearPackages = async () => {
      const previous = state
      state = newState()
      const cleanup = retire(previous)
      retiring.add(cleanup)
      try { await Promise.all([...retiring]) } finally { retiring.delete(cleanup) }
    }
    yield async () => {
      await retire(state)
      await Promise.all([...retiring])
    }

    const candidates = (): SkillCandidate[] => usable().map((skill) => {
      const locator: OfficialSkillLocator = {
        id: skill.id,
        key: skill.key,
        revision: skill.packageRevision,
        displayName: skill.name,
      }
      return {
        name: skill.key,
        description: catalogDescription(skill.name, skill.summary),
        invocation: { modelInvocable: true, userInvocable: true },
        provider: OFFICIAL_GALLERY_SKILL_PROVIDER,
        source: 'runtime',
        rank: OFFICIAL_GALLERY_SKILL_RANK,
        resourceBase: {
          kind: 'opaque',
          description: `Official skill "${skill.name}" (revision ${String(skill.packageRevision)}); resources load with the skill body.`,
        },
        locator,
      }
    })


    const provider: SkillProvider = {
      name: OFFICIAL_GALLERY_SKILL_PROVIDER,
      list: () => Promise.resolve(candidates()),
      async get(candidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
        const current = state
        const operation = (async (): Promise<SkillDefinition | undefined> => {
        const epoch=generation?.(),signal=AbortSignal.any([current.control.signal,...lifecycle?[lifecycle]:[],...options.signal?[options.signal]:[]])
        const locator = candidate.locator as OfficialSkillLocator
        if (!usable().some(skill => skill.key === locator.key && skill.id === locator.id && skill.packageRevision === locator.revision)) return undefined
        signal?.throwIfAborted()
        let payload: GroundOfficialSkillContent
        try {
          payload = await withAbort(ground.fetchSkillContent(locator.id, locator.revision, signal), signal)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          throw new Error(`Official skill "${locator.displayName}" could not be loaded: ${message}`)
        }
        if (payload.id !== locator.id || payload.key !== locator.key || payload.packageRevision !== locator.revision) {
          throw new Error(`Official skill "${locator.displayName}" revision no longer matches the frozen Session.`)
        }
        if(!('packageFormat' in payload)&&(Buffer.byteLength(payload.instruction,'utf8')>131072||payload.references.length>64))throw new Error('Official skill exceeds managed package limits')
        signal?.throwIfAborted()
        const directory = 'packageFormat' in payload
          ? await current.packages.prepare(payload, ground, options.cwd, signal)
          : await materializeSkillPackage(
          current.materializations,
          ground,
          locator,
          payload,
          signal,
        )
        signal?.throwIfAborted()
        if(generation&&generation()!==epoch)throw new Error('GALLERY_STALE_SKILL_LOAD')
        loaded?.(payload,stripFrontmatter(payload.instruction),directory)
        const { rank: _rank, locator: _locator, ...summary } = candidate
        return {
          ...summary,
          resourceBase: { kind: 'directory', path: directory },
          content: stripFrontmatter(payload.instruction),
        }
        })()
        current.pending.add(operation)
        try { return await operation } finally { current.pending.delete(operation) }
      },
    }

    yield skillsService.registerProvider(control => { lifecycle=control.signal;invalidate=()=>control.invalidate(); return provider })
  }, 'official-gallery: session skill provider')
  return async () => { invalidate(); await clearPackages() }
}

async function materializeSkillPackage(
  cache: Map<string, string>,
  ground: GroundOfficialAgentClient,
  locator: OfficialSkillLocator,
  payload: Exclude<GroundOfficialSkillContent, { packageFormat: 2 }>,
  signal: AbortSignal | undefined,
): Promise<string> {
  const cacheKey = `${locator.id}@${String(locator.revision)}`
  const existing = cache.get(cacheKey)
  if (existing !== undefined) return existing

  const directory=await mkdtemp(join(tmpdir(),'mmp-official-skill-'))
  try {
    await writeFile(join(directory, 'SKILL.md'), payload.instruction, {encoding:'utf8',mode:0o400,flag:'wx'})
    let referenceBytes=0
    for (const reference of payload.references) {
      signal?.throwIfAborted()
      const relative = reference.path.replace(/^\/+/, '')
      if (!relative.startsWith('references/') || relative.includes('..') || relative.includes('\\') || relative.includes('\0')) throw new Error('Invalid official skill resource path')
      const bytes = await ground.fetchSkillResource(locator.id, locator.revision, relative, signal)
      referenceBytes+=bytes.length;if(bytes.length>1048576||referenceBytes>4194304)throw new Error('Official skill resource byte limit')
      const target = join(directory, ...relative.split('/'))
      await mkdir(dirname(target), { recursive: true,mode:0o700 })
      await writeFile(target, bytes,{mode:0o400,flag:'wx'})
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
  cache.set(cacheKey, directory)
  return directory
}
