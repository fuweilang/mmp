import { z } from 'zod'
import type { ProjectionDefinition } from '@mammoth-ai/mmp-session-projection'
import { MAMMOTH_AI_ANSWER } from './types.ts'
import type {
  AnswerExpertView,
  OfficialAgentBindingState,
  OfficialGalleryAnswerExpertState,
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

const answerExpertSchema = z.object({
  name: z.string().min(1),
  agentId: z.string().min(1),
}).strict()

const answerExpertStateSchema = z.object({
  pending: z.record(z.string(), answerExpertSchema),
  byTurn: z.record(z.string(), answerExpertSchema),
}).strict()

function answerExpertOf(data: unknown): { requestId: string; expert: AnswerExpertView } | undefined {
  if (!data || typeof data !== 'object') return undefined
  const record = data as { requestId?: unknown; expert?: unknown }
  if (typeof record.requestId !== 'string' || record.requestId === '') return undefined
  if (record.expert === null) return { requestId: record.requestId, expert: MAMMOTH_AI_ANSWER }
  if (!record.expert || typeof record.expert !== 'object') return undefined
  const expert = record.expert as { name?: unknown; agentId?: unknown }
  if (typeof expert.name !== 'string' || expert.name === '' || typeof expert.agentId !== 'string' || expert.agentId === '') return undefined
  return { requestId: record.requestId, expert: { name: expert.name, agentId: expert.agentId } }
}

function answerIdentityTurn(data: unknown): number | undefined {
  if (!data || typeof data !== 'object') return undefined
  const turn = (data as { turn?: unknown }).turn
  if (!Number.isSafeInteger(turn) || Number(turn) < 0) return undefined
  return Number(turn)
}

function answerTurnOf(data: unknown): { requestId: string; turn: number } | undefined {
  if (!data || typeof data !== 'object') return undefined
  const record = data as { requestId?: unknown; turn?: unknown }
  if (typeof record.requestId !== 'string' || record.requestId === '' || !Number.isSafeInteger(record.turn) || Number(record.turn) < 0) return undefined
  return { requestId: record.requestId, turn: Number(record.turn) }
}

function sameAnswerExpert(left: AnswerExpertView | undefined, right: AnswerExpertView): boolean {
  return left !== undefined && left.name === right.name && left.agentId === right.agentId
}

/**
 * Expert shown above each reply. The name comes from the attempt.
 * The turn number arrives when that attempt is claimed. Role text stays on the Host.
 */
export const officialGalleryAnswerExpertProjection = {
  key: 'officialGalleryAnswerExpert',
  stateSchema: answerExpertStateSchema as z.ZodType<OfficialGalleryAnswerExpertState>,
  stateVersion: 1,
  init: (): OfficialGalleryAnswerExpertState => ({ pending: {}, byTurn: {} }),
  apply: (state: OfficialGalleryAnswerExpertState, event: { type: string; data?: unknown }): OfficialGalleryAnswerExpertState => {
    if (event.type === 'official-gallery/answer-identity') {
      const turn = answerIdentityTurn(event.data)
      if (turn === undefined || state.byTurn[String(turn)] !== undefined) return state
      return { ...state, byTurn: { ...state.byTurn, [String(turn)]: MAMMOTH_AI_ANSWER } }
    }
    if (event.type === 'official-gallery/attempt') {
      const next = answerExpertOf(event.data)
      if (next === undefined || sameAnswerExpert(state.pending[next.requestId], next.expert)) return state
      return { ...state, pending: { ...state.pending, [next.requestId]: next.expert } }
    }
    if (event.type !== 'official-gallery/attempt-start') return state
    const started = answerTurnOf(event.data)
    const expert = started === undefined ? undefined : state.pending[started.requestId]
    if (started === undefined || expert === undefined || sameAnswerExpert(state.byTurn[String(started.turn)], expert)) return state
    return { ...state, byTurn: { ...state.byTurn, [String(started.turn)]: expert } }
  },
  wire: {
    viewSchema: z.record(z.string(), answerExpertSchema) as z.ZodType<OfficialGalleryAnswerExpertState['byTurn']>,
    view: (state: OfficialGalleryAnswerExpertState) => state.byTurn,
  },
} satisfies ProjectionDefinition<'officialGalleryAnswerExpert', OfficialGalleryAnswerExpertState>

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
