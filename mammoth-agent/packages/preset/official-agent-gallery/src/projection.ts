import { z } from 'zod'
import type { ProjectionDefinition } from '@mammoth-ai/mmp-session-projection'
import type {
  OfficialAgentBindingState,
  OfficialGallerySentSkillsState,
  OfficialGallerySourceState,
  OfficialSkillBindingState,
  SentSkillView,
} from './types.ts'

const skillSummarySchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  summary: z.string(),
  category: z.enum(['common', 'content', 'analytics', 'office', 'education', 'expertise', 'business', 'ecommerce', 'sales', 'hr', 'legal', 'finance', 'consulting', 'research', 'files', 'search', 'writing', 'lifestyle']).nullable(),
  packageRevision: z.number().int().nonnegative(),
  enabledAt: z.string().nullable(),
}).strict()

const bindingSchema = z.object({
  agentId: z.string().min(1),
  versionId: z.string().min(1),
  kind: z.enum(['GENERAL', 'KNOWLEDGE']),
  name: z.string().min(1),
  systemPrompt: z.string(),
  toolScope: z.array(z.string()),
  linkedSkills: z.array(skillSummarySchema).optional(),
}).strict()

const stateSchema = z.object({ binding: bindingSchema.nullable() }).strict()

const gallerySourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('expert'),
    id: z.string().min(1),
    key: z.string().min(1),
    name: z.string().min(1),
    versionId: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('skill'),
    id: z.string().min(1),
    key: z.string().min(1),
    name: z.string().min(1),
    packageRevision: z.number().int().nonnegative(),
    avatarUrl: z.string().nullable().optional(),
  }).strict(),
])

const gallerySourceStateSchema = z.object({ source: gallerySourceSchema.nullable() }).strict()

const skillCardSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  summary: z.string(),
  category: z.enum(['common', 'content', 'analytics', 'office', 'education', 'expertise', 'business', 'ecommerce', 'sales', 'hr', 'legal', 'finance', 'consulting', 'research', 'files', 'search', 'writing', 'lifestyle']).nullable(),
  enabledAt: z.string().nullable(),
  packageRevision: z.number().int().nonnegative(),
}).strict()

const skillBindingSchema = z.object({
  sessionSource: z.object({
    type: z.literal('skill'),
    id: z.string().min(1),
    key: z.string().min(1),
    name: z.string().min(1),
    packageRevision: z.number().int().nonnegative(),
    avatarUrl: z.string().nullable().optional(),
  }).strict(),
  skill: skillCardSchema,
  standardCapabilities: z.object({
    files: z.literal(true),
    terminal: z.literal(true),
    network: z.literal(true),
  }).strict(),
  loadPolicy: z.object({
    initialContext: z.literal('summary_only'),
    instructionOnDemand: z.literal(true),
    contentPath: z.string().min(1),
  }).strict(),
}).strict()

const skillBindingStateSchema = z.object({ binding: skillBindingSchema.nullable() }).strict()

/** Rebuild the complete model-visible official configuration without exposing it through Client projections. */
export const officialAgentBindingProjection = {
  key: 'officialAgentExecution',
  stateSchema: stateSchema as z.ZodType<OfficialAgentBindingState>,
  // Bumped: optional linkedSkills frozen onto new expert Sessions.
  stateVersion: 2,
  init: () => ({ binding: null }),
  apply: (state, event) => event.type === 'official-agent/bound'
    ? { binding: event.data as OfficialAgentBindingState['binding'] }
    : state,
} satisfies ProjectionDefinition<'officialAgentExecution', OfficialAgentBindingState>

/**
 * Client-visible plaza origin. Expert and skill Sessions share one chip shape.
 * Does not imply skill instruction bodies were loaded (Task 5).
 */
export const officialGallerySourceProjection = {
  key: 'officialGallerySource',
  stateSchema: gallerySourceStateSchema as z.ZodType<OfficialGallerySourceState>,
  stateVersion: 1,
  init: () => ({ source: null }),
  apply: (state, event) => {
    if (event.type === 'official-gallery/source') {
      return { source: event.data as OfficialGallerySourceState['source'] }
    }
    return state
  },
  wire: {
    viewSchema: gallerySourceSchema.nullable() as z.ZodType<OfficialGallerySourceState['source']>,
    view: (state: OfficialGallerySourceState) => state.source,
  },
} satisfies ProjectionDefinition<'officialGallerySource', OfficialGallerySourceState>

const sentSkillSchema = z.object({
  name: z.string().min(1),
  key: z.string().min(1),
  icon: z.string().nullable(),
  offset: z.number().int().nonnegative().optional(),
}).strict()

const sentSkillsStateSchema = z.object({
  byRequest: z.record(z.string(), z.array(sentSkillSchema)),
}).strict()

function sentSkillsOf(data: unknown): { requestId: string; skills: SentSkillView[] } | undefined {
  if (!data || typeof data !== 'object') return undefined
  const record = data as { requestId?: unknown; skills?: unknown; skill?: unknown; skillMarks?: unknown }
  if (typeof record.requestId !== 'string' || record.requestId === '') return undefined
  const listed = Array.isArray(record.skills) ? record.skills : record.skill === undefined || record.skill === null ? [] : [record.skill]
  const marks = Array.isArray(record.skillMarks) && record.skillMarks.length === listed.length ? record.skillMarks : undefined
  const skills: SentSkillView[] = []
  for (const [index, item] of listed.entries()) {
    if (!item || typeof item !== 'object') return undefined
    const binding = item as { skill?: { name?: unknown }; sessionSource?: { key?: unknown; avatarUrl?: unknown } }
    const name = binding.skill?.name
    const key = binding.sessionSource?.key
    if (typeof name !== 'string' || name === '' || typeof key !== 'string' || key === '') return undefined
    const avatar = binding.sessionSource?.avatarUrl
    const mark = marks?.[index]
    skills.push({
      name, key, icon: typeof avatar === 'string' && avatar !== '' ? avatar : null,
      ...(Number.isSafeInteger(mark) && Number(mark) >= 0 ? { offset: Number(mark) } : {}),
    })
  }
  return skills.length === 0 ? undefined : { requestId: record.requestId, skills }
}

function sameSentSkills(left: readonly SentSkillView[], right: readonly SentSkillView[]): boolean {
  return left.length === right.length && left.every((skill, index) => {
    const other = right[index]
    return other !== undefined && skill.name === other.name && skill.key === other.key && skill.icon === other.icon && skill.offset === other.offset
  })
}

/**
 * Client-visible skills for each sent message. Names come from the attempt.
 * Older attempts store one `skill`; later attempts store `skills` in chip order.
 * Display fields stay out of the composition hash.
 */
export const officialGallerySentSkillsProjection = {
  key: 'officialGallerySentSkills',
  stateSchema: sentSkillsStateSchema as z.ZodType<OfficialGallerySentSkillsState>,
  stateVersion: 1,
  init: (): OfficialGallerySentSkillsState => ({ byRequest: {} }),
  apply: (state: OfficialGallerySentSkillsState, event: { type: string; data?: unknown }): OfficialGallerySentSkillsState => {
    if (event.type !== 'official-gallery/attempt') return state
    const next = sentSkillsOf(event.data)
    if (next === undefined) return state
    const current = state.byRequest[next.requestId]
    if (current !== undefined && sameSentSkills(current, next.skills)) return state
    return { byRequest: { ...state.byRequest, [next.requestId]: next.skills } }
  },
  wire: {
    viewSchema: z.record(z.string(), z.array(sentSkillSchema)) as z.ZodType<OfficialGallerySentSkillsState['byRequest']>,
    view: (state: OfficialGallerySentSkillsState) => state.byRequest,
  },
} satisfies ProjectionDefinition<'officialGallerySentSkills', OfficialGallerySentSkillsState>

/** Host-only skill freeze for Task 5 on-demand loading; never wire the body. */
export const officialSkillBindingProjection = {
  key: 'officialSkillExecution',
  stateSchema: skillBindingStateSchema as z.ZodType<OfficialSkillBindingState>,
  stateVersion: 1,
  init: () => ({ binding: null }),
  apply: (state, event) => event.type === 'official-skill/bound'
    ? { binding: event.data as OfficialSkillBindingState['binding'] }
    : state,
} satisfies ProjectionDefinition<'officialSkillExecution', OfficialSkillBindingState>
