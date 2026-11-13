import { completeSkillFields } from './skill-package-format.ts'
import { executionConfigSchema, previewSchema, knowledgeResultSchema, openedSourceSchema, runtimeReference, type RuntimeBinding, type ExactSource, type ExpertPreview, type KnowledgeResult, type OpenedSource } from './knowledge-protocol.ts'
import type { CatalogQuery } from './types.ts'
import { z } from 'zod'

const skillCategorySchema = z.enum(['common', 'content', 'analytics', 'office', 'education', 'expertise', 'business', 'ecommerce', 'sales', 'hr', 'legal', 'finance', 'consulting', 'research', 'files', 'search', 'writing', 'lifestyle']).nullable()

const skillSummarySchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  summary: z.string(),
  category: skillCategorySchema,
  packageRevision: z.number().int().nonnegative(),
  enabledAt: z.string().nullable(),
}).strict()

const skillCardSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  summary: z.string(),
  category: skillCategorySchema,
  enabledAt: z.string().nullable(),
  packageRevision: z.number().int().nonnegative(),
  discovery: z.object({
    capability: z.string().min(1),
    industries: z.array(z.string().min(1)),
  }).strict().optional(),
}).strict()


const catalogDetailSchema=z.object({
 kind:z.enum(['expert','skill']),id:z.string().min(1),key:z.string().min(1),name:z.string(),summary:z.string(),avatarUrl:z.string().nullable(),
 versionId:z.string().optional(),packageRevision:z.number().int().positive().optional(),
 discovery:z.object({capability:z.string(),industries:z.array(z.string())}).strict().optional(),
 detail:z.object({schemaVersion:z.literal(1),displayRevision:z.number().int().nonnegative(),introduction:z.string().max(2000),outputs:z.array(z.string().max(300)).max(5),materials:z.array(z.string().max(300)).max(5),boundaries:z.array(z.string().max(300)).max(5),starters:z.array(z.object({text:z.string().max(500),label:z.string().max(40).optional()}).strict().transform(({text,label})=>({text,...(label?{label}:{})}))).max(3)}).strict(),
 linkedSkills:z.array(z.object({id:z.string(),name:z.string(),summary:z.string()}).strict()),
}).strict()

const skillSessionBindingSchema = z.object({
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

const skillContentIdentity = {
  id: z.string().min(1), key: z.string().min(1), name: z.string().min(1), summary: z.string(),
  packageRevision: z.number().int().nonnegative(), instruction: z.string(),
}
const skillContentSchema = z.union([
  z.object({ ...skillContentIdentity, references: z.array(z.object({ path: z.string().min(1) }).strict()) }).strict(),
  z.object({ ...skillContentIdentity, ...completeSkillFields }).strict(),
])

async function boundedBody(response: Response, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted()
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel()
    throw new Error('Ground skill response byte limit exceeded')
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let bytes = 0
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}) }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    for (;;) {
      signal?.throwIfAborted()
      const chunk = await reader.read()
      signal?.throwIfAborted()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > maxBytes) throw new Error('Ground skill response byte limit exceeded')
      chunks.push(chunk.value)
    }
    const result = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
    return result
  } finally {
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
    await response.body.cancel().catch(() => {})
  }
}

const cardSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  kind: z.enum(['GENERAL', 'KNOWLEDGE']),
  category: z.enum(['common', 'productivity', 'content', 'sales', 'expertise', 'analytics']).nullable(),
  versionId: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  summary: z.string(),
  openingQuestions: z.array(z.string()),
  capabilities: z.array(z.string()),
  avatarUrl: z.string().nullable(),
  executionGranted: z.boolean(),
  linkedSkills: z.array(skillSummarySchema).optional(),
}).strict()

const discoverySchema=z.object({capability:z.string(),industries:z.array(z.string())}).strict()
const expertPageSchema=z.object({items:z.array(cardSchema.extend({discovery:discoverySchema.optional()})),total:z.number(),hasMore:z.boolean(),nextCursor:z.string().nullable()}).strict()
const skillPageSchema=z.object({items:z.array(skillCardSchema.extend({avatarUrl:z.string().nullable().optional()})),total:z.number(),hasMore:z.boolean(),nextCursor:z.string().nullable()}).strict()
const facetSchema=z.object({total:z.number(),capabilities:z.array(z.object({id:z.string(),count:z.number()}).strict()),industries:z.array(z.object({id:z.string(),count:z.number()}).strict())}).strict()
const expertHomeSchema=z.object({facets:facetSchema,page:expertPageSchema}).strict()
const skillHomeSchema=z.object({facets:facetSchema,page:skillPageSchema}).strict()

const legacyExecutionSchema = z.object({
  agentId: z.string().min(1),
  key: z.string().min(1),
  kind: z.enum(['GENERAL', 'KNOWLEDGE']),
  versionId: z.string().min(1),
  version: z.number().int().positive(),
  systemPrompt: z.string(),
  toolScope: z.array(z.string()),
  linkedSkills: z.array(skillSummarySchema).optional(),
}).strict()

const executionSchema = z.union([legacyExecutionSchema.extend({executionProtocol:z.literal(2),versionId:z.string().nullable(),version:z.number().int().nonnegative(),executionConfig:executionConfigSchema,preview:previewSchema.optional()}).strict(),legacyExecutionSchema])

const retrievalSchema = z.object({
  tenantId: z.string().min(1),
  hits: z.array(z.object({
    documentId: z.string().min(1),
    documentName: z.string().min(1),
    ordinal: z.number().int().nonnegative(),
    folderName: z.string().nullable(),
    snippet: z.string(),
    score: z.number(),
  }).strict()),
}).strict()

const searchSchema = z.object({
  provider: z.string().min(1),
  hits: z.array(z.object({
    title: z.string(),
    url: z.string().min(1),
    snippet: z.string(),
    summary: z.string().optional(),
    publishedAt: z.string().nullable().optional(),
    siteName: z.string().optional(),
  }).strict()),
}).strict()

const tabularSchema = z.object({
  format: z.enum(['csv', 'json']),
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
  appliedGroupBy: z.string().optional(),
  columns: z.array(z.object({
    name: z.string(),
    inferredType: z.enum(['number', 'string', 'boolean', 'empty', 'mixed']),
    nonNull: z.number().int().nonnegative(),
    nullish: z.number().int().nonnegative(),
    sampleValues: z.array(z.string()),
    min: z.number().optional(),
    max: z.number().optional(),
    sum: z.number().optional(),
    mean: z.number().optional(),
  }).strict()),
  groupSummary: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).optional(),
  outliers: z.array(z.object({
    column: z.string(),
    rowIndex: z.number().int().nonnegative(),
    value: z.number(),
    reason: z.string(),
  }).strict()).optional(),
  warnings: z.array(z.string()),
}).strict()

const fetchSchema = z.object({
  url: z.string().min(1),
  finalUrl: z.string().min(1),
  status: z.number().int(),
  contentType: z.string(),
  accessedAt: z.string().min(1),
  title: z.string().optional(),
  text: z.string(),
  truncated: z.boolean(),
}).strict()

const delegateSchema = z.object({
  route: z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    agentId: z.string().min(1),
    versionId: z.string().min(1),
    version: z.number().int().positive(),
  }).strict(),
  answer: z.string(),
  modelRef: z.string().optional(),
  toolTrace: z.array(z.object({
    tool: z.string(),
    ok: z.boolean(),
    detail: z.string(),
  }).strict()),
  depth: z.literal(1),
  limits: z.object({
    maxDepth: z.literal(1),
    allowlist: z.array(z.string()),
  }).strict(),
}).strict()

/** Validated public card returned by Ground. */
export type GroundOfficialAgentCard = z.infer<typeof cardSchema>
/** Validated public skill directory card returned by Ground. */
export type GroundOfficialSkillCard = z.infer<typeof skillCardSchema>
/** Validated Ground skill session binding; Host creates the Session. */
export type GroundOfficialSkillSessionBinding = z.infer<typeof skillSessionBindingSchema>
/** Validated on-demand skill instruction payload from Ground. */
export type GroundOfficialSkillContent = z.infer<typeof skillContentSchema>
/** Validated frozen execution configuration returned only to the Host. */
export type GroundOfficialExecution = z.infer<typeof executionSchema>
/** Validated enterprise retrieval result returned only to the Host. */
export type GroundOfficialRetrieval = z.infer<typeof retrievalSchema>
/** Validated web search result returned only to the Host. */
export type GroundOfficialWebSearch = z.infer<typeof searchSchema>
/** Validated tabular analysis result. */
export type GroundOfficialTabular = z.infer<typeof tabularSchema>
/** Validated public page fetch result. */
export type GroundOfficialFetch = z.infer<typeof fetchSchema>
/** Validated single-layer delegate result. */
export type GroundOfficialDelegate = z.infer<typeof delegateSchema>

/** Host-only Ground API client; tokens and execution configuration never enter browser payloads. */
export class GroundOfficialAgentClient {
  constructor(
    private readonly origin: string,
    private readonly token: () => Promise<string>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  currentScope(signal?:AbortSignal){return this.request('/api/official-agents/catalog-preferences/scope',z.object({userId:z.string().min(1),scope:z.string().min(1)}),{...signal?{signal}:{}})}
  preferences(kind:'expert'|'skill',view:'favourites'|'recent') {
    return this.request(`/api/official-agents/catalog-preferences?kind=${kind}&view=${view}`,z.array(z.object({kind:z.enum(['expert','skill']),resourceId:z.string(),favourite:z.boolean(),lastUsedAt:z.string().nullable()})),{})
  }
  preference(kind:'expert'|'skill',resourceId:string,action:'favourite'|'used',favourite?:boolean,expectedAuthScope?:{userId:string;scope:string}) {
    return this.request('/api/official-agents/catalog-preferences',z.object({ok:z.literal(true)}),{method:'POST',body:JSON.stringify({kind,resourceId,action,...favourite===undefined?{}:{favourite},...expectedAuthScope?{expectedScope:expectedAuthScope.scope,expectedUserId:expectedAuthScope.userId}:{}})})
  }

  private catalogSuffix(query:CatalogQuery){const params=new URLSearchParams();for(const key of ['q','capability','industry','cursor'] as const){const value=query[key];if(value)params.set(key,value);}return params.size?`?${params}`:''}
  private homeSuffix(query:CatalogQuery){const params=new URLSearchParams();for(const key of ['q','capability','industry'] as const){const value=query[key];if(value)params.set(key,value);}return params.size?`?${params}`:''}
  pageExperts(query:CatalogQuery){return this.request(`/api/official-agents/catalog-page${this.catalogSuffix(query)}`,expertPageSchema,{})}
  pageSkills(query:CatalogQuery){return this.request(`/api/official-skills/catalog-page${this.catalogSuffix(query)}`,skillPageSchema,{})}
  openExperts(query:CatalogQuery){return this.request(`/api/official-agents/catalog-home${this.homeSuffix(query)}`,expertHomeSchema,{})}
  openSkills(query:CatalogQuery){return this.request(`/api/official-skills/catalog-home${this.homeSuffix(query)}`,skillHomeSchema,{})}
  expertFacets(){return this.request('/api/official-agents/catalog-facets',facetSchema,{})}
  skillFacets(){return this.request('/api/official-skills/catalog-facets',facetSchema,{})}
  getCard(id:string){return this.request(`/api/official-agents/${encodeURIComponent(id)}/catalog-card`,cardSchema,{})}

  /**
   * List all published public cards; phase-1 executionGranted is true for all published agents.
   * @param signal - optional caller cancellation forwarded to Ground.
   * @returns validated browser-safe cards.
   */
  async catalogDetail(kind:'expert'|'skill',id:string){
    return this.request(`/api/official-${kind==='expert'?'agents':'skills'}/${encodeURIComponent(id)}/catalog-detail`,catalogDetailSchema,{})
  }

  async list(signal?: AbortSignal): Promise<GroundOfficialAgentCard[]> {
    return this.request('/api/official-agents', z.array(cardSchema), {
      ...signal === undefined ? {} : { signal },
    })
  }

  /**
   * List enabled official skill summaries for the expert plaza skill tab.
   * @param signal - optional caller cancellation forwarded to Ground.
   * @returns validated browser-safe skill cards without instruction body or package paths.
   */
  async listSkills(signal?: AbortSignal): Promise<GroundOfficialSkillCard[]> {
    return this.request('/api/official-skills', z.array(skillCardSchema), {
      ...signal === undefined ? {} : { signal },
    })
  }

  /** Explicit new-client read; legacy Remote listSkills keeps its four-category payload. */
  async listSkillFacets(signal?: AbortSignal): Promise<GroundOfficialSkillCard[]> {
    return this.request('/api/official-skills?taxonomy=facets', z.array(skillCardSchema), {
      ...signal === undefined ? {} : { signal },
    })
  }

  /**
   * Revalidate active account and published status, then resolve one frozen version.
   * @param agentId - public official Expert identity.
   * @param versionId - frozen published version identity.
   * @param signal - optional caller cancellation forwarded to Ground.
   * @returns validated Host-only execution configuration.
   */
  async resolve(agentId: string, versionId: string, signal?: AbortSignal): Promise<GroundOfficialExecution> {
    return this.request(`/api/official-agents/${encodeURIComponent(agentId)}/resolve`, executionSchema, {
      method: 'POST', body: JSON.stringify({ versionId, executionProtocol:2 }),
      ...signal === undefined ? {} : { signal },
    })
  }

  /**
   * Resolve a creator-only preview ID without manufacturing snapshot metadata.
   * @param agentId - Official expert identity.
   * @param previewId - Immutable creator-owned preview identity.
   * @param signal - Optional cancellation forwarded to Ground.
   * @returns The validated immutable execution snapshot.
   */
  resolvePreview(agentId:string,previewId:string,signal?:AbortSignal):Promise<GroundOfficialExecution>{
    return this.request(`/api/official-agents/${encodeURIComponent(agentId)}/runtime/resolve`,executionSchema,{method:'POST',body:JSON.stringify({executionProtocol:2,previewId}),...signal?{signal}:{}})
  }
  /**
   * Resolve one immutable published or creator-only preview snapshot.
   * @param binding - Frozen published version or creator-owned preview.
   * @param signal - Optional cancellation forwarded to Ground.
   * @returns The validated immutable execution snapshot.
   */
  resolveRuntime(binding:RuntimeBinding,signal?:AbortSignal):Promise<GroundOfficialExecution>{
    return this.request(`/api/official-agents/${encodeURIComponent(binding.agentId)}/runtime/resolve`,executionSchema,{method:'POST',body:JSON.stringify(runtimeReference(binding)),...signal?{signal}:{}})
  }
  /**
   * Retrieve with Host-owned session/turn identity; model arguments contain only query.
   * @param binding - Frozen published version or creator-owned preview.
   * @param sessionId - Host-owned Session identity.
   * @param turnId - Host-owned turn identity.
   * @param query - Visible user question or focused supplemental question.
   * @param signal - Optional cancellation forwarded to Ground.
   * @param context - Bounded visible conversation preceding the current question.
   * @returns The validated retrieval result and rendered context.
   */
  retrieveRuntime(binding:RuntimeBinding,sessionId:string,turnId:string,query:string,signal?:AbortSignal,context:readonly {role:'user'|'assistant';content:string}[]=[]):Promise<KnowledgeResult>{
    return this.request(`/api/official-agents/${encodeURIComponent(binding.agentId)}/runtime/retrieve`,knowledgeResultSchema,{method:'POST',body:JSON.stringify({...runtimeReference(binding),sessionId,turnId,query,context}),...signal?{signal}:{}})
  }
  /**
   * Terminal server snapshot for the whole historical lineage, after exact text reads.
   * @param scope - Original user and account-space identity.
   * @param entries - Nonempty frozen runtime bindings and their exact source references.
   * @param signal - Optional cancellation forwarded to Ground.
   * @returns Successful authorization of the complete historical lineage.
   */
  authorizeHistory(scope:{userId:string;scope:string},entries:readonly {binding:RuntimeBinding;sources:ExactSource[]}[],signal?:AbortSignal):Promise<{authorized:true}>{
    return this.request(`/api/official-agents/${encodeURIComponent(entries[0]!.binding.agentId)}/runtime/history/authorize`,z.object({authorized:z.literal(true)}).strict(),{method:'POST',body:JSON.stringify({...scope,entries:entries.map(({binding,sources})=>({agentId:binding.agentId,...runtimeReference(binding),sources}))}),...signal?{signal}:{}})
  }
  /**
   * Verify exact persisted text prefixes and authority together in one fresh database decision.
   * @param scope - Original user and account-space identity.
   * @param entries - Nonempty frozen bindings and exact source references with persisted text.
   * @param signal - Optional cancellation forwarded to Ground.
   * @returns Authorization and content verification for the complete historical lineage.
   */
  validateHistory(
    scope:{ userId:string;scope:string },
    entries:readonly { binding:RuntimeBinding;sources:Array<ExactSource & { text:string }> }[],
    signal?:AbortSignal,
  ):Promise<{ authorized:true;contentVerified:true }>{
    const first = entries[0]
    if (!first) throw new Error('Historical authorization requires at least one binding')
    return this.request(`/api/official-agents/${encodeURIComponent(first.binding.agentId)}/runtime/history/authorize`,z.object({ authorized:z.literal(true),contentVerified:z.literal(true) }).strict(),{ method:'POST',body:JSON.stringify({ ...scope,verifyContent:true,entries:entries.map(({ binding,sources })=>({ agentId:binding.agentId,...runtimeReference(binding),sources })) }),...signal?{ signal }:{} })
  }
  /**
   * Reauthorize and open exactly the persisted source tuple, never the latest revision.
   * @param binding - Frozen published version or creator-owned preview.
   * @param source - Exact immutable source identifiers persisted with the answer.
   * @param signal - Optional cancellation forwarded to Ground.
   * @returns The authorized original source passage and offsets.
   */
  openSource(binding:RuntimeBinding,source:ExactSource,signal?:AbortSignal):Promise<OpenedSource>{
    return this.request(`/api/official-agents/${encodeURIComponent(binding.agentId)}/runtime/sources/open`,openedSourceSchema,{method:'POST',body:JSON.stringify({...runtimeReference(binding),...source}),...signal?{signal}:{}})
  }

  /**
   * Retrieve only within the server-owned Agent scope and the member's document ACL.
   * @param agentId - public official Expert identity.
   * @param versionId - frozen published version identity.
   * @param query - user question; tenant and folder identifiers are never accepted.
   * @param signal - optional caller cancellation forwarded to Ground.
   * @returns validated document snippets scoped by Ground.
   */
  async retrieve(agentId: string, versionId: string, query: string, signal?: AbortSignal): Promise<GroundOfficialRetrieval> {
    return this.request(`/api/official-agents/${encodeURIComponent(agentId)}/retrieve`, retrievalSchema, {
      method: 'POST', body: JSON.stringify({ versionId, query }),
      ...signal === undefined ? {} : { signal },
    })
  }

  /**
   * Run entitlement-checked web search for one frozen official Expert version.
   * @param agentId - public official Expert identity.
   * @param versionId - frozen published version identity.
   * @param query - user search question; provider keys stay on Ground.
   * @param signal - optional caller cancellation forwarded to Ground.
   * @returns validated search hits.
   * @param preview - Optional creator-owned preview replacing the published version reference.
   */
  async search(agentId: string, versionId: string|null, query: string, signal?: AbortSignal, preview?:ExpertPreview): Promise<GroundOfficialWebSearch> {
    return this.request(`/api/official-agents/${encodeURIComponent(agentId)}/${preview?'runtime/':''}search`, searchSchema, {
      method: 'POST', body: JSON.stringify({ ...(preview?{executionProtocol:2,previewId:preview.id}:{versionId}), query }),
      ...signal === undefined ? {} : { signal },
    })
  }


  /**
   * Run entitlement-checked tabular analysis for one frozen official Expert version.
   * @param preview - Optional creator-owned preview replacing the published version reference.
   */
  async analyzeTabular(
    agentId: string,
    versionId: string|null,
    body: { content: string; format?: 'csv' | 'json' | 'auto'; groupBy?: string; metrics?: string[]; goal?: string },
    signal?: AbortSignal,
    preview?:ExpertPreview,
  ): Promise<GroundOfficialTabular> {
    return this.request(`/api/official-agents/${encodeURIComponent(agentId)}/${preview?'runtime/':''}analyze-tabular`, tabularSchema, {
      method: 'POST', body: JSON.stringify({ ...(preview?{executionProtocol:2,previewId:preview.id}:{versionId}), ...body }),
      ...signal === undefined ? {} : { signal },
    })
  }

  /**
   * Fetch one public URL under entitlement checks; provider keys stay on Ground.
   * @param preview - Optional creator-owned preview replacing the published version reference.
   */
  async fetchUrl(agentId: string, versionId: string|null, url: string, signal?: AbortSignal, preview?:ExpertPreview): Promise<GroundOfficialFetch> {
    return this.request(`/api/official-agents/${encodeURIComponent(agentId)}/${preview?'runtime/':''}fetch-url`, fetchSchema, {
      method: 'POST', body: JSON.stringify({ ...(preview?{executionProtocol:2,previewId:preview.id}:{versionId}), url }),
      ...signal === undefined ? {} : { signal },
    })
  }

  /**
   * Single-layer official Expert delegation for the boss orchestrator.
   * @param preview - Optional creator-owned preview replacing the published version reference.
   */
  async delegate(
    agentId: string,
    versionId: string|null,
    body: { targetKey: string; task: string; tabularContent?: string; tabularFormat?: 'csv' | 'json' | 'auto' },
    signal?: AbortSignal,
    preview?:ExpertPreview,
  ): Promise<GroundOfficialDelegate> {
    return this.request(`/api/official-agents/${encodeURIComponent(agentId)}/${preview?'runtime/':''}delegate`, delegateSchema, {
      method: 'POST', body: JSON.stringify({ ...(preview?{executionProtocol:2,previewId:preview.id}:{versionId}), ...body }),
      ...signal === undefined ? {} : { signal },
    })
  }


  /** Deleted flag for an existing tag. Does not admit a new execution. */
  async skillAvailability(skillId: string, signal?: AbortSignal) {
    return this.request(
      `/api/official-skills/${encodeURIComponent(skillId)}/availability`,
      z.object({ id: z.string().min(1), name: z.string(), deleted: z.boolean(), selectable: z.boolean() }).strict(),
      { ...signal === undefined ? {} : { signal } },
    )
  }

  /**
   * Validate an enabled skill and return Host freeze payload. Does not create a Host Session.
   * @param skillId - public official skill identity.
   * @param expectedRevision - optional package revision guard.
   * @param signal - optional caller cancellation forwarded to Ground.
   * @returns validated sessionSource + summary_only loadPolicy (no instruction body).
   */
  async beginSkillSession(
    skillId: string,
    expectedRevision?: number,
    signal?: AbortSignal,
  ): Promise<GroundOfficialSkillSessionBinding> {
    const body = expectedRevision === undefined ? {} : { expectedRevision }
    return this.request(`/api/official-skills/${encodeURIComponent(skillId)}/sessions`, skillSessionBindingSchema, {
      method: 'POST',
      body: JSON.stringify(body),
      ...signal === undefined ? {} : { signal },
    })
  }

  /**
   * Negotiate a frozen complete package or read a legacy instruction/reference payload.
   * Pass an explicit revision so disabled skills remain readable for existing Sessions.
   * @param skillId - Frozen official skill identity.
   * @param revision - Frozen package revision selected by the Session.
   * @param signal - Optional cancellation forwarded to Ground.
   * @returns A validated complete package manifest or legacy instruction/reference payload.
   */
  async fetchSkillContent(
    skillId: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<GroundOfficialSkillContent> {
    const path = `/api/official-skills/${encodeURIComponent(skillId)}/content?revision=${encodeURIComponent(String(revision))}&packageFormat=2`
    return this.request(path, skillContentSchema, {
      ...signal === undefined ? {} : { signal },
    // 500 paths × 512 UTF-16 units × 3 UTF-8 bytes, 100KiB instruction
    // × 6 JSON escape bytes, plus bounded identity/display fields fit within 2MiB.
    }, 2 * 1024 * 1024)
  }

  /**
   * Load one declared skill package resource at a frozen revision.
   * Ground checks the exact revision's file index; Host enforces the supplied byte bound while reading.
   * @param skillId - Frozen official skill identity.
   * @param revision - Frozen package revision selected by the Session.
   * @param resourcePath - Exact relative path declared by that revision.
   * @param signal - Optional cancellation forwarded to Ground.
   * @param maxBytes - Maximum response bytes accepted while reading the resource.
   * @returns Verified-length-bounded resource bytes for subsequent integrity validation.
   */
  async fetchSkillResource(
    skillId: string,
    revision: number,
    resourcePath: string,
    signal?: AbortSignal,
    maxBytes = 1048576,
  ): Promise<Uint8Array> {
    const url = new URL(`/api/official-skills/${encodeURIComponent(skillId)}/resources`, this.origin)
    url.searchParams.set('path', resourcePath)
    url.searchParams.set('revision', String(revision))
    const response = await this.fetcher(url, {
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        Accept: '*/*',
      },
      ...signal === undefined ? {} : { signal },
    })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 401) throw new Error('猛犸登录已失效，请重新登录。')
      throw new Error(`Ground official skill resource failed with HTTP ${response.status}`)
    }
    return boundedBody(response, maxBytes, signal)
  }

  private async request<Schema extends z.ZodType>(
    path: string,
    schema: Schema,
    init: RequestInit,
    maxBytes?: number,
  ): Promise<z.infer<Schema>> {
    const response = await this.fetcher(new URL(path, this.origin), {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        Accept: 'application/json',
        ...init.body === undefined ? {} : { 'Content-Type': 'application/json' },
      },
    })
    if (!response.ok) {
      if (response.status === 401) {await response.body?.cancel();throw new Error('猛犸登录已失效，请重新登录。')}
      let message=''
      if(response.headers.get('content-type')?.includes('application/json')){
        const body:unknown=await boundedBody(response,8192,init.signal??undefined).then(bytes=>JSON.parse(new TextDecoder().decode(bytes))).catch(()=>null)
        if(body&&typeof body==='object'&&'code' in body&&body.code==='OFFICIAL_SKILL_DELETED'&&'message' in body&&typeof body.message==='string')message=body.message
      }else await response.body?.cancel()
      throw new Error(message || `Ground official Expert request failed with HTTP ${response.status}`)
    }
    const value: unknown = maxBytes === undefined ? await response.json() : JSON.parse(new TextDecoder().decode(await boundedBody(response, maxBytes, init.signal ?? undefined)))
    return schema.parse(value) as z.infer<Schema>
  }
}
