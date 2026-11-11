import type { ExpertExecutionConfig, ExpertPreview } from './knowledge-protocol.ts'
import type { WorkspaceId } from '@mammoth-ai/mmp-workspace/types'

export type OfficialAgentCategory =
  | 'common'
  | 'productivity'
  | 'content'
  | 'sales'
  | 'expertise'
  | 'analytics'

/** Skill categories for the public skill directory (Ground-managed, one-level taxonomy). */
export type OfficialSkillCategory =
  | 'common'
  | 'content'
  | 'analytics'
  | 'office'
  | 'education'
  | 'expertise'
  | 'business'
  | 'ecommerce'
  | 'sales'
  | 'hr'
  | 'legal'
  | 'finance'
  | 'consulting'
  | 'research'
  | 'files'
  | 'search'
  | 'writing'
  | 'lifestyle'

/** Browser-safe summary of an enabled skill linked to an official expert. */
export interface OfficialSkillSummary {
  readonly id: string
  readonly key: string
  readonly name: string
  readonly summary: string
  readonly category: OfficialSkillCategory | null
  readonly packageRevision: number
  readonly enabledAt: string | null
}

/** Public card safe to return to a browser. */
export interface OfficialAgentCard {
  readonly id: string
  readonly key: string
  readonly kind: 'GENERAL' | 'KNOWLEDGE'
  /** Gallery main category from Ground parent agent; null when unset. */
  readonly category: OfficialAgentCategory | null
  readonly versionId: string
  readonly version: number
  readonly name: string
  readonly summary: string
  readonly openingQuestions: readonly string[]
  /** Up to 3 capability chips: tool-derived first, then stored content labels. */
  readonly capabilities: readonly string[]
  /** Absolute public portrait URL when Ground has one; null keeps the glyph fallback. */
  readonly avatarUrl: string | null
  /** Whether the current enterprise may execute this Agent; browse does not require it. */
  readonly executionGranted: boolean
  /** Enabled linked skill summaries from Ground; omitted or empty when none. */
  readonly linkedSkills?: readonly OfficialSkillSummary[] | undefined
  readonly discovery?: { readonly capability: string; readonly industries: readonly string[] } | undefined

}

/** Public skill directory card; never includes instruction body or package paths. */
export interface OfficialSkillCard {
  readonly id: string
  readonly key: string
  readonly name: string
  readonly summary: string
  readonly category: OfficialSkillCategory | null
  readonly enabledAt: string | null
  readonly packageRevision: number
  /** Display-only facets; never permissions or a frozen content revision. */
  readonly discovery?: {
    readonly capability: string
    readonly industries: readonly string[]
  } | undefined
  readonly avatarUrl?: string | null | undefined

}

/** Request to create a Session bound to one currently authorized official version. */
export interface OfficialAgentSessionRequest {
  readonly agentId: string
  readonly workspaceId: WorkspaceId
  readonly openingQuestion?: string
}

/** Frozen execution data replayed exclusively on the Host. */
export interface OfficialAgentBinding {
  readonly agentId: string
  readonly versionId: string | null
  readonly kind: 'GENERAL' | 'KNOWLEDGE'
  readonly name: string
  readonly systemPrompt: string
  readonly toolScope: readonly string[]
  /** Enabled linked skill summaries frozen for Host; bodies load on demand via SkillProvider. */
  readonly linkedSkills?: readonly OfficialSkillSummary[] | undefined
  readonly executionConfig?: ExpertExecutionConfig | undefined
  readonly preview?: ExpertPreview | undefined
}

/** Host-only projection state restored from the Session event log. */
export interface OfficialAgentBindingState {
  readonly binding: OfficialAgentBinding | null
}

/** Request to create a standard Session bound to one enabled official skill. */
export interface OfficialSkillSessionRequest {
  readonly skillId: string
  readonly workspaceId: WorkspaceId
  /** Optional revision check against Ground; mismatch rejects without mutating any session. */
  readonly expectedRevision?: number
}

/**
 * Client-visible gallery origin frozen onto a new Session.
 * Binding metadata only; skill bodies load on demand via the session SkillProvider.
 */
export type OfficialGallerySource =
  | {
    readonly type: 'expert'
    readonly id: string
    readonly key: string
    readonly name: string
    readonly versionId: string | null
  }
  | {
    readonly type: 'skill'
    readonly id: string
    readonly key: string
    readonly name: string
    readonly packageRevision: number
    readonly avatarUrl?: string | null
  }

/** Host-only skill session freeze: source + load policy, never the instruction body. */
export interface OfficialSkillBinding {
  readonly sessionSource: {
    readonly type: 'skill'
    readonly id: string
    readonly key: string
    readonly name: string
    readonly packageRevision: number
    readonly avatarUrl?: string | null | undefined
  }
  readonly skill: OfficialSkillCard
  readonly standardCapabilities: {
    readonly files: true
    readonly terminal: true
    readonly network: true
  }
  readonly loadPolicy: {
    readonly initialContext: 'summary_only'
    readonly instructionOnDemand: true
    readonly contentPath: string
  }
}

/** Host-only projection state for skill-sourced Sessions. */
export interface OfficialSkillBindingState {
  readonly binding: OfficialSkillBinding | null
}

/** Client-visible gallery source projection state. */
export interface OfficialGallerySourceState {
  readonly source: OfficialGallerySource | null
}

/** Expert shown above the reply for one turn. Display fields only. */
export interface AnswerExpertView {
  readonly name: string
  readonly agentId: string
}

/** Byline for a turn that had no selected expert. It is not a catalog expert. */
export const MAMMOTH_AI_ANSWER: AnswerExpertView = {
  name: '猛犸AI',
  agentId: 'mammoth-ai',
}

/**
 * Answering expert for each turn.
 * `pending` keeps the attempt until its turn number is known. The wire view is `byTurn`.
 */
export interface OfficialGalleryAnswerExpertState {
  readonly pending: Readonly<Record<string, AnswerExpertView>>
  readonly byTurn: Readonly<Record<string, AnswerExpertView>>
}

/** One skill painted on a sent user message. Portrait URLs are optional. `offset` is its place in the message text. */
export interface SentSkillView {
  readonly name: string
  readonly key: string
  readonly icon: string | null
  readonly offset?: number
}

/**
 * Skills for sent messages, keyed by the prompt request id.
 * One list per message that carried skills, in chip order. The list grows
 * with those messages so a reload can paint each bubble. Attempts without
 * skills are omitted.
 */
export interface OfficialGallerySentSkillsState {
  readonly byRequest: Readonly<Record<string, readonly SentSkillView[]>>
}

declare module '@mammoth-ai/mmp-session-projection/types' {
  interface SessionProjectionMap {
    /** Client-visible expert/skill origin chip for plaza-created Sessions. */
    officialGallerySource: OfficialGallerySource | null
    /** Skills on each sent user message, keyed by the prompt request id. */
    officialGallerySentSkills: Readonly<Record<string, readonly SentSkillView[]>>
    /** Expert who answered each turn, keyed by turn number. */
    officialGalleryAnswerExpert: Readonly<Record<string, AnswerExpertView>>
  }
}


/** Additive paged catalog contracts; legacy list methods remain available. */
export interface CatalogQuery { readonly q?:string | undefined; readonly capability?:string | undefined; readonly industry?:string | undefined; readonly cursor?:string | undefined }
export interface CatalogCount { readonly id:string; readonly count:number }
export interface CatalogFacets { readonly total:number; readonly capabilities:readonly CatalogCount[]; readonly industries:readonly CatalogCount[] }
export interface ExpertCatalogPage { readonly items:readonly OfficialAgentCard[]; readonly total:number; readonly hasMore:boolean; readonly nextCursor:string|null }
export interface SkillCatalogPage { readonly items:readonly OfficialSkillCard[]; readonly total:number; readonly hasMore:boolean; readonly nextCursor:string|null }

/** Public allowlisted discovery document; no role, package paths or tool configuration. */
export interface CatalogDiscoveryDetail {
 readonly schemaVersion:1; readonly displayRevision:number; readonly introduction:string;
 readonly outputs:readonly string[]; readonly materials:readonly string[]; readonly boundaries:readonly string[];
 readonly starters:readonly {readonly text:string;readonly label?:string|undefined}[];
}
export interface CatalogDetail {
 readonly kind:'expert'|'skill';readonly id:string;readonly key:string;readonly name:string;readonly summary:string;readonly avatarUrl:string|null;
 readonly versionId?:string|undefined;readonly packageRevision?:number|undefined;
 readonly discovery?:{readonly capability:string;readonly industries:readonly string[]}|undefined;
 readonly detail:CatalogDiscoveryDetail;
 readonly linkedSkills:readonly {readonly id:string;readonly name:string;readonly summary:string}[];
}

/** Tag state for one official skill; a deleted skill is never selectable. */
export interface OfficialSkillAvailability { readonly id:string; readonly name:string; readonly deleted:boolean; readonly selectable:boolean }

export interface GalleryRuntimeView {phase:string;attemptId:string;turn:number;generation:number;loaded:boolean;artifactCount:number;lastArtifact:{id:string;name:string}|null}
declare module '@mammoth-ai/mmp-session-projection/types' {interface SessionProjectionMap {officialGalleryRuntime:GalleryRuntimeView}}

/** Exact source labels indexed by their owning turn and lookup; bodies require fresh Remote authorization. */
export interface ExpertKnowledgeSource {recordId:string;turn:number;messageId:string;label:string;title:string;locator:string}
declare module '@mammoth-ai/mmp-session-projection/types' {interface SessionProjectionMap {officialExpertKnowledge: import('@mammoth-ai/mmp-session-projection/types').SessionProjectionSummaryExcluded<ExpertKnowledgeSource[]>}}

export type { OpenedSource } from './knowledge-protocol.ts'
/** Request to create a creator-owned preview in a granted Workspace. */
export interface OfficialPreviewSessionRequest extends OfficialAgentSessionRequest {readonly previewId:string}
