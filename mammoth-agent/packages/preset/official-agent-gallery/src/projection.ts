import { executionConfigSchema, previewSchema } from './knowledge-protocol.ts'
import { z } from 'zod'
import type { ProjectionDefinition } from '@mammoth-ai/mmp-session-projection'
import type {
  OfficialAgentBindingState,
  OfficialGallerySourceState,
  OfficialSkillBindingState,
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
  versionId: z.string().min(1).nullable(),
  kind: z.enum(['GENERAL', 'KNOWLEDGE']),
  name: z.string().min(1),
  systemPrompt: z.string(),
  toolScope: z.array(z.string()),
  linkedSkills: z.array(skillSummarySchema).optional(),
  executionConfig:executionConfigSchema.optional(),preview:previewSchema.optional(),
}).strict()

const stateSchema = z.object({ binding: bindingSchema.nullable() }).strict()

const gallerySourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('expert'),
    id: z.string().min(1),
    key: z.string().min(1),
    name: z.string().min(1),
    versionId: z.string().min(1).nullable(),
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
  stateVersion: 3,
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
  stateVersion: 2,
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
