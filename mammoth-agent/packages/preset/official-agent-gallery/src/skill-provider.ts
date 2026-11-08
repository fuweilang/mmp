/**
 * Session-scoped SkillProvider for Ground-managed official skills.
 * Lists frozen summaries only; loads SKILL.md (+ references) on demand via Ground.
 */
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

function stripFrontmatter(raw: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u.exec(raw)
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
 */
export function installOfficialGallerySkills(
  agentCtx: Context,
  ground: GroundOfficialAgentClient,
  skills: readonly OfficialSkillSummary[] | (() => readonly OfficialSkillSummary[]),
  loaded?: (payload:GroundOfficialSkillContent,body:string)=>void,
  generation?:()=>number|undefined,
): () => void {
  const skillsService = agentCtx.get('skills')
  if (skillsService === undefined) return () => {}
  let invalidate = () => {}
  let lifecycle:AbortSignal|undefined
  const usable = () => (typeof skills === 'function' ? skills() : skills).filter(skill => isSkillName(skill.key))

  agentCtx.effect(function* () {
    const materializations = new Map<string, string>()
    yield async () => {
      await Promise.all([...materializations.values()].map(async (directory) => {
        await rm(directory, { recursive: true, force: true })
      }))
      materializations.clear()
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
        const epoch=generation?.(),signal=lifecycle?AbortSignal.any([lifecycle,...options.signal?[options.signal]:[]]):options.signal
        const locator = candidate.locator as OfficialSkillLocator
        if (!usable().some(skill => skill.key === locator.key && skill.id === locator.id && skill.packageRevision === locator.revision)) return undefined
        signal?.throwIfAborted()
        let payload: GroundOfficialSkillContent
        try {
          payload = await ground.fetchSkillContent(locator.id, locator.revision, signal)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          throw new Error(`Official skill "${locator.displayName}" could not be loaded: ${message}`)
        }
        if (payload.key !== locator.key || payload.packageRevision !== locator.revision) {
          throw new Error(`Official skill "${locator.displayName}" revision no longer matches the frozen Session.`)
        }
        if(Buffer.byteLength(payload.instruction,'utf8')>131072||payload.references.length>64)throw new Error('Official skill exceeds managed package limits')
        signal?.throwIfAborted()
        const directory = await materializeSkillPackage(
          materializations,
          ground,
          locator,
          payload,
          signal,
        )
        signal?.throwIfAborted()
        if(generation&&generation()!==epoch)throw new Error('GALLERY_STALE_SKILL_LOAD')
        loaded?.(payload,stripFrontmatter(payload.instruction))
        const { rank: _rank, locator: _locator, ...summary } = candidate
        return {
          ...summary,
          resourceBase: { kind: 'directory', path: directory },
          content: stripFrontmatter(payload.instruction),
        }
      },
    }

    yield skillsService.registerProvider(control => { lifecycle=control.signal;invalidate=()=>control.invalidate(); return provider })
  }, 'official-gallery: session skill provider')
  return () => invalidate()
}

async function materializeSkillPackage(
  cache: Map<string, string>,
  ground: GroundOfficialAgentClient,
  locator: OfficialSkillLocator,
  payload: GroundOfficialSkillContent,
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
