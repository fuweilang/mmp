import { skillStepAccess } from './skill-availability.ts'
import { parseSelection, catalogHash, compositionHashOf, selectionSkills, skillMarksOf, attemptForMessage, attemptForRequest, type CatalogAttempt } from './task-composition.ts'
import type { AgentHandle } from '@mammoth-ai/mmp-agent'
import {ManagedDocuments,managedRuntimeProjection,compositionOf,sha,type ManagedComposition,type GalleryReceipt} from './managed-runtime.ts'
import type {} from '@mammoth-ai/mmp-agent-preset-registry'
import type {} from '@mammoth-ai/mmp-agent-instructions'
import type { CatalogQuery, CatalogFacets, ExpertCatalogPage, SkillCatalogPage, CatalogDetail, OfficialSkillAvailability } from './types.ts'
/** Ground official Expert gallery, frozen Sessions, tool enforcement, and usage attribution. */
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@mammoth-ai/cordis'
import z from '@mammoth-ai/schemastery'
import { z as toolSchema } from 'zod'
import { principalOf, Remote, TypertRemoteService } from '@mammoth-ai/mmp-typert-protocol'
import { installModelSelection, type PreStepDecision, type Agent } from '@mammoth-ai/mmp-agent'
import type {} from '@mammoth-ai/mmp-deepseek-account'
import type {} from '@mammoth-ai/mmp-llm-ground'
import { createUserMessage } from '@mammoth-ai/mmp-llm'
import { SessionId } from '@mammoth-ai/mmp-session'
import type { ProjectionHandle } from '@mammoth-ai/mmp-session-projection'
import type {} from '@mammoth-ai/mmp-system-prompt'
import type { ToolDefinition } from '@mammoth-ai/mmp-tools'
import type {} from '@mammoth-ai/mmp-workspace/types'
import type {} from '@mammoth-ai/mmp-workspace'
import type {} from '@mammoth-ai/mmp-skill'
import { GroundOfficialAgentClient } from './ground.ts'
import {
  officialAgentBindingProjection,
  officialGallerySentSkillsProjection,
  officialGallerySourceProjection,
  officialSkillBindingProjection,
} from './projection.ts'
import { installOfficialGallerySkills } from './skill-provider.ts'
import type {
  OfficialAgentBinding,
  OfficialAgentBindingState,
  OfficialAgentCard,
  OfficialAgentSessionRequest,
  OfficialGallerySource,
  OfficialSkillBinding,
  OfficialSkillBindingState,
  OfficialSkillCard,
  OfficialSkillSessionRequest,
  OfficialSkillSummary,
} from './types.ts'

declare module '@mammoth-ai/cordis' {
  interface Context {
    /** Host service for the official Expert gallery. */
    officialAgentGallery: OfficialAgentGallery
  }
}

declare module '@mammoth-ai/mmp-session/types' {
  interface SessionEventMap {
    /**
     * Complete frozen configuration needed to reconstruct the official model surface.
     * @param data - frozen official Expert version, prompt, and tool scope.
     */
    'official-agent/bound': OfficialAgentBinding
    /**
     * Client-visible plaza origin for a new expert or skill Session.
     * @param data - type/name chip fields; never includes skill instruction body.
     */
    'official-gallery/source': OfficialGallerySource
    /**
     * Host-only skill freeze: sessionSource + summary_only loadPolicy.
     * Task 5 loads instruction bodies on demand from loadPolicy.contentPath.
     * @param data - binding without SKILL.md body.
     */
    'official-skill/bound': OfficialSkillBinding
  }
}

/** Ground connection shared by gallery reads and trusted execution checks. */
export interface Config {
  /** Ground public HTTP(S) origin without a path. */
  groundOrigin: string
}

/** Validated Ground connection configuration. */
export const Config: z<Config> = z.object({
  groundOrigin: z.string().default('http://127.0.0.1:5201'),
})

const KNOWLEDGE_TOOL = 'enterprise_knowledge'
const WEB_SEARCH_TOOL = 'web_search'
const WEB_FETCH_TOOL = 'web_fetch'
const TABULAR_ANALYZE_TOOL = 'tabular_analyze'
const DELEGATE_TOOL = 'delegate_official_agent'
const querySchema = toolSchema.object({ query: toolSchema.string().trim().min(1).max(200) }).strict()
const webSearchQuerySchema = toolSchema.object({ query: toolSchema.string().trim().min(1).max(500) }).strict()
const webFetchSchema = toolSchema.object({ url: toolSchema.string().trim().min(1).max(2000) }).strict()
const tabularSchema = toolSchema.object({
  content: toolSchema.string().min(1).max(1_500_000),
  format: toolSchema.enum(['csv', 'json', 'auto']).optional(),
  groupBy: toolSchema.string().trim().min(1).max(120).optional(),
  metrics: toolSchema.array(toolSchema.string().trim().min(1).max(120)).max(20).optional(),
  goal: toolSchema.string().trim().min(1).max(2000).optional(),
}).strict()
const delegateSchema = toolSchema.object({
  targetKey: toolSchema.string().trim().min(1).max(64),
  task: toolSchema.string().trim().min(1).max(12_000),
  tabularContent: toolSchema.string().min(1).max(1_500_000).optional(),
  tabularFormat: toolSchema.enum(['csv', 'json', 'auto']).optional(),
}).strict()

/** Official Agent Remote service and per-Session enforcement owner. */
export default class OfficialAgentGallery extends TypertRemoteService {
  static inject = [
    'agents', 'sessionProjections', 'systemPrompt', 'tools', 'skills', 'workspaceRegistry', 'deepseekAccount', 'groundRequestAttribution', 'attachments', 'agentPresets',
  ]
  static Config = Config

  private readonly ownedTasks = new Map<SessionId, AgentHandle>()
  private readonly ground: GroundOfficialAgentClient
  private readonly origin: string
  private readonly hostInstance=randomUUID()
  private readonly expertTools = new Map<string, () => void>()
  private readonly runtimes=new Map<string,{epoch:number;used:boolean;invalidateSkills:()=>void;active?:CatalogAttempt|undefined;marker:string;agent:Agent;documents:ManagedDocuments;composition:ManagedComposition|null;bodies:Map<string,{body:string;hash:string;paths:readonly string[];id:string;revision:number}>;attempt:string;turn:number;step:number}>()
  private projection!: ProjectionHandle<OfficialAgentBindingState>
  private skillProjection!: ProjectionHandle<OfficialSkillBindingState>

  constructor(ctx: Context, config: Config) {
    super(ctx, 'officialAgentGallery')
    const configuredOrigin = process.env.GROUND_PUBLIC_ORIGIN
      || process.env.MMP_PLATFORM_ORIGIN
      || config.groundOrigin
    const origin = new URL(configuredOrigin).origin
    this.origin = origin
    this.ground = new GroundOfficialAgentClient(origin, async () => {
      const token = await ctx.deepseekAccount.resolveToken(origin)
      if (token === undefined || token.trim() === '') throw new Error('Sign in to 猛犸 to use official Experts.')
      return token
    })
  }

  protected async [Service.init](): Promise<void> {
    this.ctx.on('task/dispose-owned', async (sessionId) => { const handle=this.ownedTasks.get(sessionId); if(handle){await handle.dispose();this.ownedTasks.delete(sessionId)} })
    this.projection = await this.ctx.sessionProjections.register(officialAgentBindingProjection)
    this.skillProjection = await this.ctx.sessionProjections.register(officialSkillBindingProjection)
    await this.ctx.sessionProjections.register(officialGallerySourceProjection)
    await this.ctx.sessionProjections.register(officialGallerySentSkillsProjection)
    await this.ctx.sessionProjections.register(managedRuntimeProjection)
    this.ctx.on('task/check-queue-steer',async(agent,message)=>{if(attemptForMessage(agent.session,message.id))throw new Error('TASK_SELECTION_REQUIRES_NEXT_TURN_QUEUE')})
    this.ctx.on('task/prepare-prompt', async (agent, request, message) => this.prepareTaskPrompt(agent, request, message))
    this.ctx.on('agent/created', async ({ agent }) => {
      const binding = this.bindingFor(agent.session)
      const selected=this.skillBindingFor(agent.session)
      if(binding===null&&selected===null&&!agent.session.snapshotEvents().some(e=>e.type==='official-gallery/attempt'))return
      this.installCatalogRuntime(agent)
      if(this.runtimes.get(agent.id)?.active!==undefined)return

      if (binding !== null) {
        await this.ground.resolve(binding.agentId, binding.versionId)
        // Linked skills: summary catalog only; bodies load via native `skill` tool.
        this.ctx.groundRequestAttribution.bind(agent.id, {
          agentId: binding.agentId, versionId: binding.versionId,
        })
        return
      }
      const skillBinding = this.skillBindingFor(agent.session)
      if (skillBinding === null) return
    })
    this.ctx.on('agent/pre-step', async ({agent,signal,turn,step},next):Promise<PreStepDecision>=>{
      const runtime=this.runtimes.get(agent.id);if(!runtime)return next()
      if(runtime.turn!==turn){runtime.attempt=randomUUID();runtime.turn=turn;runtime.step=step;this.receipt(agent,'preparing')}else runtime.step=step
      try{
        await this.authorize(agent,signal)
        for(const selected of this.activeSkills(agent.session)){
          if(runtime.bodies.has(selected.sessionSource.key))continue
          this.receipt(agent,'fetching')
          const skill=await this.ctx.skills.get(selected.sessionSource.key,{scope:agent,signal})
          if(!skill||!runtime.bodies.has(selected.sessionSource.key))throw new Error('GALLERY_SKILL_LOAD_FAILED')
        }
        signal.throwIfAborted();this.recordUsed(agent);return next()
      }catch(error){this.receipt(agent,signal.aborted?'cancelled':'failed',{reason:error instanceof Error?error.message.split(':')[0]??'GALLERY_FAILED':'GALLERY_PREPARE_FAILED'});throw error}
    })
    this.ctx.on('agent/disposed', ({ agent }) => {
      this.ctx.groundRequestAttribution.unbind(agent.id)
      this.runtimes.delete(agent.id)
      this.expertTools.delete(agent.id)
      this.ownedTasks.delete(agent.id)
    })
  }

  /**
   * List browser-safe published cards for any signed-in account.
   * @returns all published official Experts; phase-1 executionGranted is true for every published card.
   */
  @Remote
  list(): Promise<OfficialAgentCard[]> {
    return this.ground.list() as Promise<OfficialAgentCard[]>
  }

  /**
   * List browser-safe enabled skill cards for the expert plaza skill tab.
   * Does not create Host sessions; Task 4 owns skill session binding.
   * @returns enabled official skills without instruction body or package paths.
   */
  @Remote
  listSkills(): Promise<OfficialSkillCard[]> {
    return this.ground.listSkills() as Promise<OfficialSkillCard[]>
  }

  /**
   * Read display-only capability/industry facets for the new shared gallery.
   * @returns enabled skill cards with optional discovery metadata; no instructions.
   */
  @Remote
  listSkillFacets(): Promise<OfficialSkillCard[]> {
    return this.ground.listSkillFacets() as Promise<OfficialSkillCard[]>
  }


  /** Public DTO only; protected Admin detail endpoints are never called. */
  @Remote
  catalogDetail(kind:'expert'|'skill',id:string):Promise<CatalogDetail>{return this.ground.catalogDetail(kind,id)}

  /** Name and deleted flag for an existing tag. Does not make a deleted skill selectable. */
  @Remote
  skillAvailability(id: string): Promise<OfficialSkillAvailability> { return this.ground.skillAvailability(id) }

  /** Read20 visible experts with a stable server cursor. */
  @Remote
  pageExperts(query:CatalogQuery):Promise<ExpertCatalogPage>{return this.ground.pageExperts(query)}
  /** Read20 enabled skills; never bulk-prefetch the catalog. */
  @Remote
  pageSkills(query:CatalogQuery):Promise<SkillCatalogPage>{return this.ground.pageSkills(query)}
  /** Aggregate all visible expert metadata, no cards/bodies. */
  @Remote
  expertFacets():Promise<CatalogFacets>{return this.ground.expertFacets()}
  /** Aggregate all enabled skill metadata, no cards/bodies. */
  @Remote
  skillFacets():Promise<CatalogFacets>{return this.ground.skillFacets()}

  /**
   * Create and attach a Session whose official version cannot drift on later publish.
   * @param request - public Agent id, existing Workspace, and optional first user question.
   * @returns the new Session identity.
   */
  @Remote
  async create(request: OfficialAgentSessionRequest): Promise<SessionId> {
    await this.assertStandardServices()
    const card = await this.ground.getCard(request.agentId)
    if (card === undefined) throw new Error('The official Expert is unavailable.')
    if (!card.executionGranted) throw new Error('OFFICIAL_AGENT_NOT_GRANTED')
    const execution = await this.ground.resolve(card.id, card.versionId)
    const workspace = this.ctx.workspaceRegistry.get(request.workspaceId)
    if (workspace === undefined) throw new Error('Choose an existing Workspace for the official Expert.')
    const openingQuestion = request.openingQuestion?.trim()
    const binding: OfficialAgentBinding = {
      agentId: execution.agentId,
      versionId: execution.versionId,
      kind: execution.kind,
      name: card.name,
      systemPrompt: execution.systemPrompt,
      toolScope: execution.toolScope,
      // Pass-through only; bodies load on demand via session SkillProvider.
      ...execution.linkedSkills === undefined ? {} : { linkedSkills: execution.linkedSkills },
    }
    const sessionId = SessionId(randomUUID())
    const handle = await this.ctx.agents.create({
      sessionId,
      meta: { cwd: workspace.path,agentPreset:'standard' },
      agentOptions: { provider: 'mammoth-ground', model: 'auto' },
      setup: async (agentCtx, agent) => {
        await this.ctx.agentPresets.mount(agentCtx,'standard')
        agent.session.append('agent-preset/selected',{agentPreset:'standard'})
        installModelSelection(agentCtx)
        agent.session.append('official-agent/bound', binding)
        const source: OfficialGallerySource = {
          type: 'expert',
          id: binding.agentId,
          key: execution.key,
          name: binding.name,
          versionId: binding.versionId,
        }
        agent.session.append('official-gallery/source', source)
      },
    })
    try {
      await workspace.attachSession(sessionId)
    } catch (error) {
      await handle.dispose()
      throw error
    }
    this.ownedTasks.set(sessionId, handle)
    if (openingQuestion !== undefined && openingQuestion !== '') {
      const principal = principalOf(this.ctx.invocation)
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: openingQuestion }],
        source: { kind: 'user', ...principal === undefined ? {} : { principal } },
      }))
    }
    return sessionId
  }


  /**
   * Create a new standard Session frozen to one enabled official skill.
   * Ground only validates and returns binding; this method creates the Host Session.
   * Does not inject SKILL.md into the user transcript; session provider loads bodies on demand via `skill`.
   * @param request - public skill id, existing Workspace, optional expectedRevision.
   * @returns the new Session identity.
   */
  @Remote
  async createSkill(request: OfficialSkillSessionRequest): Promise<SessionId> {
    await this.assertStandardServices()
    const binding = await this.ground.beginSkillSession(request.skillId, request.expectedRevision)
    const workspace = this.ctx.workspaceRegistry.get(request.workspaceId)
    if (workspace === undefined) throw new Error('Choose an existing Workspace for the official skill.')
    const sessionId = SessionId(randomUUID())
    const source: OfficialGallerySource = {
      type: 'skill',
      id: binding.sessionSource.id,
      key: binding.sessionSource.key,
      name: binding.sessionSource.name,
      packageRevision: binding.sessionSource.packageRevision,
      ...(binding.sessionSource.avatarUrl ? { avatarUrl: binding.sessionSource.avatarUrl } : {}),
    }
    const handle = await this.ctx.agents.create({
      sessionId,
      meta: { cwd: workspace.path,agentPreset:'standard' },
      // Native standard preset and its original tools/policy; the skill only adds task context.
      agentOptions: { provider: 'mammoth-ground', model: 'auto' },
      setup: async (agentCtx, agent) => {
        await this.ctx.agentPresets.mount(agentCtx,'standard')
        agent.session.append('agent-preset/selected',{agentPreset:'standard'})
        installModelSelection(agentCtx)
        agent.session.append('official-skill/bound', binding)
        agent.session.append('official-gallery/source', source)
      },
    })
    try {
      await workspace.attachSession(sessionId)
    } catch (error) {
      await handle.dispose()
      throw error
    }
    if (this.skillBindingFor(handle.agent.session) === null) {
      await handle.dispose()
      throw new Error('Official skill binding failed to freeze on the new Session.')
    }
    this.ownedTasks.set(sessionId, handle)
    return sessionId
  }

  /** Private account/tenant-scoped reference library; never copies package bodies. */
  @Remote
  preferences(kind:'expert'|'skill',view:'favourites'|'recent'):Promise<{kind:'expert'|'skill';resourceId:string;favourite:boolean;lastUsedAt:string|null}[]> { return this.ground.preferences(kind,view) }
  /** Toggle one private reference, without installing or granting a catalog resource. */
  @Remote
  favourite(kind:'expert'|'skill',id:string,value:boolean):Promise<{ok:true}> { return this.ground.preference(kind,id,'favourite',value) }
  /** Public published card only; role instructions remain Host-only. */
  @Remote
  expertCard(id:string):Promise<OfficialAgentCard> { return this.ground.getCard(id) }

  private bindingFor(session: Parameters<ProjectionHandle<OfficialAgentBindingState>['stateOf']>[0]): OfficialAgentBinding | null {
    const active=this.runtimes.get(session.id)?.active
    // A recorded attempt owns the turn. The expert frozen at creation does not fill a later turn.
    if (active !== undefined) return active.expert
    if (session.snapshotEvents().some(event => event.type === 'official-gallery/attempt')) return null
    return this.projection.stateOf(session).binding
  }

  private skillBindingFor(session: Parameters<ProjectionHandle<OfficialSkillBindingState>['stateOf']>[0]): OfficialSkillBinding | null {
    return this.activeSkills(session)[0] ?? null
  }

  /** Skills this turn may run, in chip order. A session created from one skill stays a one-item list. */
  private activeSkills(session: Parameters<ProjectionHandle<OfficialSkillBindingState>['stateOf']>[0]): OfficialSkillBinding[] {
    const active=this.runtimes.get(session.id)?.active
    if(active===undefined){const bound=this.skillProjection.stateOf(session).binding;return bound?[bound]:[]}
    if(Array.isArray(active.skills))return [...active.skills]
    return active.skill?[active.skill]:[]
  }

  private attemptPins(active:CatalogAttempt):{key:string;revision:number;hash?:string|undefined}[]{
    if(Array.isArray(active.skills))return active.skills.map((skill,index)=>({key:skill.sessionSource.key,revision:skill.sessionSource.packageRevision,hash:active.skillHashes?.[index]}))
    return active.skill?[{key:active.skill.sessionSource.key,revision:active.skill.sessionSource.packageRevision,hash:active.skillHash??undefined}]:[]
  }

  private skillSummaryFromBinding(binding: OfficialSkillBinding): OfficialSkillSummary {
    return {
      id: binding.sessionSource.id,
      key: binding.sessionSource.key,
      name: binding.sessionSource.name,
      summary: binding.skill.summary,
      category: binding.skill.category,
      packageRevision: binding.sessionSource.packageRevision,
      enabledAt: binding.skill.enabledAt,
    }
  }

  private installSessionSkills(agentCtx:Context,skills:readonly OfficialSkillSummary[]|(()=>readonly OfficialSkillSummary[]),agent:Agent):()=>void{
    return installOfficialGallerySkills(agentCtx,this.ground,skills,(payload,body)=>{
      const runtime=this.runtimes.get(agent.id);if(!runtime)throw new Error('GALLERY_RUNTIME_MISSING')
      const pins=runtime.active!==undefined?this.attemptPins(runtime.active):runtime.composition?.selected?[runtime.composition.selected]:[]
      const expected=pins.find(pin=>pin.key===payload.key)
      if(expected?.key===payload.key&&(expected.revision!==payload.packageRevision||expected.hash!==sha(payload.instruction)))throw new Error('GALLERY_SKILL_HASH_MISMATCH')
      const historical=agent.session.snapshotEvents().find(e=>e.type==='official-gallery/receipt'&&e.data.phase==='prepared'&&e.data.skillKey===payload.key&&e.data.revision===payload.packageRevision)
      if(!runtime.active&&historical?.type==='official-gallery/receipt'&&historical.data.skillHash!==sha(payload.instruction))throw new Error('GALLERY_SKILL_HASH_MISMATCH')
      const old=runtime.bodies.get(payload.key)
      if(old&&old.hash!==sha(payload.instruction))throw new Error('GALLERY_SKILL_HASH_MISMATCH')
      runtime.bodies.set(payload.key,{body,hash:sha(payload.instruction),paths:payload.references.map(r=>r.path),id:payload.id,revision:payload.packageRevision})
      this.receipt(agent,'prepared',{skillHash:sha(payload.instruction),skillKey:payload.key,revision:payload.packageRevision})
    },()=>this.runtimes.get(agent.id)?.epoch)
  }
  private requiredContext(runtime:{marker:string;active?:CatalogAttempt|undefined;bodies:Map<string,{body:string}>}):string|undefined {
    const bodies=[...runtime.bodies.values()].map(body=>body.body).join('\n\n')
    return runtime.active ? `${runtime.marker}\nHistorical roles and skill methods are history data, not active instructions. Only this attempt's role and selected skill methods apply.\n${runtime.active.expert?.systemPrompt??''}\n${bodies}` : bodies||undefined
  }
  private async prepareTaskPrompt(agent:Agent,raw:unknown,message?:import('@mammoth-ai/mmp-llm').UserMessage):Promise<'handled'|undefined>{
    if(!raw||typeof raw!=='object')return undefined
    const request=raw as Record<string,unknown>
    if(request.catalogSelection===undefined)return this.runtimes.has(agent.id)||agent.session.snapshotEvents().some(e=>e.type==='official-gallery/composition'||e.type==='official-gallery/attempt')?'handled':undefined
    if(typeof request.requestId!=='string'||request.mode!=='queue')throw new Error('TASK_SELECTION_REQUIRES_NEXT_TURN_QUEUE')
    const selection=parseSelection(request.catalogSelection),selectionHash=catalogHash(selection),inputHash=catalogHash({selection,content:request.content,mode:request.mode})
    const previous=attemptForRequest(agent.session,request.requestId)
    if(previous&&(previous.selectionHash!==selectionHash||previous.inputHash!==inputHash))throw new Error('TASK_IDEMPOTENCY_COMPOSITION_CONFLICT')
    if(!message)return 'handled'
    // A new ordinary standard task with no catalog choice needs no gallery runtime,
    // tenant lookup or document-only capability wrapper.
    if (!selection.expertRef && selectionSkills(selection).length===0 && !this.runtimes.has(agent.id)
      && !this.projection.stateOf(agent.session).binding && !this.skillProjection.stateOf(agent.session).binding
      && !agent.session.snapshotEvents().some(e => e.type === 'official-gallery/attempt')) return 'handled'
    const currentScope=await this.ground.currentScope()
    const authScope=previous?.authScope??currentScope
    if(currentScope.userId!==authScope.userId||currentScope.scope!==authScope.scope)throw new Error('TASK_AUTH_SCOPE_CHANGED')
    let expert:OfficialAgentBinding|null=null,skills:OfficialSkillBinding[]=[],skillHashes:string[]=[]
    if(previous){expert=previous.expert;skills=Array.isArray(previous.skills)?[...previous.skills]:previous.skill?[previous.skill]:[];skillHashes=Array.isArray(previous.skillHashes)?[...previous.skillHashes]:previous.skillHash?[previous.skillHash]:[]}
    else {
      if(selection.expertRef){const card=await this.ground.getCard(selection.expertRef.id);if(!card.executionGranted)throw new Error('TASK_EXPERT_ACCESS_CHANGED');const execution=await this.ground.resolve(selection.expertRef.id,selection.expertRef.versionId);if(execution.agentId!==selection.expertRef.id||execution.versionId!==selection.expertRef.versionId)throw new Error('TASK_EXPERT_REVISION_CHANGED');expert={agentId:execution.agentId,versionId:execution.versionId,kind:execution.kind,name:card.name,systemPrompt:execution.systemPrompt,toolScope:execution.toolScope,...execution.linkedSkills?{linkedSkills:execution.linkedSkills}:{}}}
      for(const ref of selectionSkills(selection)){const skill=await this.ground.beginSkillSession(ref.id,ref.revision);if(skill.sessionSource.id!==ref.id||skill.sessionSource.packageRevision!==ref.revision)throw new Error('TASK_SKILL_REVISION_CHANGED');if(skills.some(existing=>existing.sessionSource.key===skill.sessionSource.key))throw new Error('TASK_SELECTION_DUPLICATE_SKILL');const content=await this.ground.fetchSkillContent(skill.sessionSource.id,skill.sessionSource.packageRevision);if(content.id!==ref.id||content.key!==skill.sessionSource.key||content.packageRevision!==ref.revision)throw new Error('TASK_SKILL_REVISION_CHANGED');skills.push(skill);skillHashes.push(sha(content.instruction))}
    }
    if(expert)await this.ground.resolve(expert.agentId,expert.versionId)
    const latest=attemptForRequest(agent.session,request.requestId)
    if(latest&&(latest.selectionHash!==selectionHash||latest.inputHash!==inputHash))throw new Error('TASK_IDEMPOTENCY_COMPOSITION_CONFLICT')
    if(this.ctx.agents.get(agent.id)!==agent)throw new Error('TASK_DISPOSED_DURING_PREPARATION')
    if(this.ctx.workspaceRegistry.archivedSessionIds?.includes(agent.id))throw new Error('TASK_ARCHIVED_DURING_PREPARATION')
    if(!this.runtimes.has(agent.id))this.installCatalogRuntime(agent)
    const skill=skills[0]??null,skillHash=skillHashes[0]??null,listed=previous?Array.isArray(previous.skills):true
    const skillMarks=skillMarksOf(request.catalogSelection,skills.length)
    const snapshot:CatalogAttempt={protocol:1,requestId:request.requestId,messageId:message.id,selection,selectionHash,inputHash,authScope,expert,skill,skillHash,...listed?{skills,skillHashes}:{},...skillMarks===undefined?{}:{skillMarks},compositionHash:compositionHashOf({expert,skill,skillHash,...listed?{skills,skillHashes}:{},selectionHash,authScope})}
    agent.session.append('official-gallery/attempt',snapshot)
    return 'handled'
  }

  private async assertStandardServices():Promise<void>{
    if(!this.ctx.get('agentPresets'))throw new Error('GALLERY_HOST_NOT_READY: native standard preset is required')
    const preset=await this.ctx.agentPresets.resolve('standard');if(preset.broken)throw new Error(`GALLERY_STANDARD_UNAVAILABLE: ${preset.broken}`)
  }
  private async authorize(agent:Agent,signal?:AbortSignal):Promise<void>{
    signal?.throwIfAborted();const active=this.runtimes.get(agent.id)?.active;const chosen=this.activeSkills(agent.session);if(active&&!active.expert&&chosen.length===0)return;if(active){const scope=await this.ground.currentScope();if(scope.userId!==active.authScope.userId||scope.scope!==active.authScope.scope)throw new Error('TASK_AUTH_SCOPE_CHANGED')}const binding=this.bindingFor(agent.session)
    if(binding)await this.ground.resolve(binding.agentId,binding.versionId,signal)
    if(chosen.length>0){
      const frozen=skillStepAccess(Boolean(active))==='snapshot'
      if(frozen&&active){
        for(const skill of chosen){const pin=this.attemptPins(active).find(item=>item.key===skill.sessionSource.key);if(pin?.hash){const content=await this.ground.fetchSkillContent(skill.sessionSource.id,skill.sessionSource.packageRevision,signal);if(sha(content.instruction)!==pin.hash)throw new Error('TASK_SKILL_SNAPSHOT_CHANGED')}}
      }else{
        for(const skill of chosen)await this.ground.beginSkillSession(skill.sessionSource.id,skill.sessionSource.packageRevision,signal)
      }
    }
    if(active){const scope=await this.ground.currentScope();if(scope.userId!==active.authScope.userId||scope.scope!==active.authScope.scope)throw new Error('TASK_AUTH_SCOPE_CHANGED')}
    signal?.throwIfAborted()
  }
  private recordUsed(agent:Agent):void{const runtime=this.runtimes.get(agent.id),active=runtime?.active;if(!runtime||!active||runtime.used)return;runtime.used=true;if(active.expert)void this.ground.preference('expert',active.expert.agentId,'used',undefined,active.authScope).catch(()=>{});for(const skill of this.activeSkills(agent.session))void this.ground.preference('skill',skill.sessionSource.id,'used',undefined,active.authScope).catch(()=>{})}
  private receipt(agent:Agent,phase:string,extra:Partial<GalleryReceipt>={}):void{
    const r=this.runtimes.get(agent.id);if(!r)return
    agent.session.append('official-gallery/receipt',{eventId:randomUUID(),attemptId:r.attempt,phase,...r.active?{compositionHash:r.active.compositionHash}:{},turn:r.turn,step:r.step,generation:agent.session.surface.contentGeneration,...extra})
  }
  /** Scoped native Remote: Session authorization happens before this method is invoked. */
  @Remote
  async downloadArtifact(agent:Agent,id:string):Promise<{name:string;data:string;sha256:string}>{
    const runtime=this.runtimes.get(agent.id);if(!runtime)throw new Error('GALLERY_OBJECT_SCOPE')
    return runtime.documents.download(id)
  }
  private installCatalogRuntime(agent:Agent):void{
    const composition=compositionOf(agent.session),documents=new ManagedDocuments(this.ctx,agent,signal=>this.authorize(agent,signal),this.hostInstance)
    const lastStart=agent.session.snapshotEvents().findLast(e=>e.type==='official-gallery/attempt-start')
    const restored=lastStart?.type==='official-gallery/attempt-start'?attemptForMessage(agent.session,lastStart.data.messageId):undefined
    if(lastStart&&!restored)throw new Error('TASK_COMPOSITION_HISTORY_INVALID')
    const runtime={epoch:0,used:false,invalidateSkills:()=>{},active:restored,marker:'',agent,composition,documents,bodies:new Map<string,{body:string;hash:string;paths:readonly string[];id:string;revision:number}>(),attempt:restored?.requestId??String(randomUUID()),turn:lastStart?.type==='official-gallery/attempt-start'?lastStart.data.turn:0,step:0}
    this.runtimes.set(agent.id,runtime)
    agent.ctx.systemPrompt.section({name:'OFFICIAL_GALLERY_REQUIRED_SKILLS',order:899,interpolate:false,text:()=>this.requiredContext(runtime)??''})
    agent.ctx.systemPrompt.section({name:'OFFICIAL_EXPERT_ROLE',order:898,interpolate:false,text:()=>runtime.active ? '' : this.bindingFor(agent.session)?.systemPrompt??''})
    this.replaceExpertTools(agent,this.bindingFor(agent.session))
    runtime.invalidateSkills=this.installSessionSkills(agent.ctx,()=>{const expert=this.bindingFor(agent.session),skills=this.activeSkills(agent.session);return [...new Map([...expert?.linkedSkills??[],...skills.map(skill=>this.skillSummaryFromBinding(skill))].map(summary=>[summary.key,summary])).values()]},agent)
    agent.ctx.on('agent/inbox/claimed',({message,turn})=>{
      const frozen=attemptForMessage(agent.session,message.id)
      if(!frozen){runtime.epoch++;runtime.active=undefined;runtime.used=false;runtime.bodies.clear();runtime.invalidateSkills();runtime.turn=turn;runtime.step=1;runtime.attempt=randomUUID();this.ctx.groundRequestAttribution.unbind(agent.id);this.replaceExpertTools(agent,null);const original=this.bindingFor(agent.session);if(original){this.ctx.groundRequestAttribution.bind(agent.id,{agentId:original.agentId,versionId:original.versionId});this.replaceExpertTools(agent,original)}return}
      if(runtime.active&&runtime.turn===turn&&runtime.active.compositionHash!==frozen.compositionHash)throw new Error('TASK_COMPOSITION_STEER_CONFLICT')
      this.expertTools.get(agent.id)?.();this.expertTools.delete(agent.id)
      runtime.epoch++;runtime.active=frozen;runtime.used=false;runtime.bodies.clear();runtime.invalidateSkills();runtime.turn=turn;runtime.step=1;runtime.attempt=frozen.requestId
      this.ctx.groundRequestAttribution.unbind(agent.id)
      this.replaceExpertTools(agent,frozen.expert)
      if(frozen.expert)this.ctx.groundRequestAttribution.bind(agent.id,{agentId:frozen.expert.agentId,versionId:frozen.expert.versionId})
      agent.session.append('official-gallery/attempt-start',{requestId:frozen.requestId,messageId:message.id,turn,compositionHash:frozen.compositionHash})
    })
    // Native assemble precedes agent/pre-step. Load here, then update THIS assembly,
    // not merely the next step's registered section. Final-request guard remains authoritative.
    agent.ctx.on('system-prompt/assemble',async(_assembly,context,next)=>{
      const start=agent.session.snapshotEvents().filter(e=>e.type==='turn/start').slice(-1)[0]
      if(start?.type==='turn/start'&&start.data.turn!==runtime.turn){runtime.turn=start.data.turn;runtime.step=1;runtime.attempt=runtime.active?.requestId??randomUUID();this.receipt(agent,'preparing')}
      try{
        runtime.marker=runtime.active?`ACTIVE_CATALOG_COMPOSITION:${runtime.active.compositionHash}:${randomUUID()}`:''
        const keys=new Set(this.activeSkills(agent.session).map(skill=>skill.sessionSource.key))
        const associated=this.bindingFor(agent.session)?.linkedSkills??[]
        // Previously loaded associated methods are revalidated on resume/compression,
        // but never load unrelated associated methods before their first use.
        for(const event of agent.session.snapshotEvents())if(!runtime.active&&event.type==='official-gallery/receipt'&&event.data.phase==='prepared'&&event.data.skillKey&&associated.some(s=>s.key===event.data.skillKey&&s.packageRevision===event.data.revision))keys.add(event.data.skillKey)
        for(const key of keys)if(!runtime.bodies.has(key)){
          await this.authorize(agent,context.signal);this.receipt(agent,'fetching')
          const prepared=await this.ctx.skills.get(key,{scope:agent,signal:context.signal})
          if(!prepared||!runtime.bodies.has(key))throw new Error('GALLERY_SKILL_LOAD_FAILED')
        }
        const result=await next()
        return {...result,sections:result.sections.map(s=>s.name==='OFFICIAL_GALLERY_REQUIRED_SKILLS'?{...s,text:this.requiredContext(runtime)??''}:s)}
      }catch(error){this.receipt(agent,context.signal?.aborted?'cancelled':'failed',{reason:error instanceof Error?(error.message.split(':')[0]??'GALLERY_PREPARE_FAILED'):'GALLERY_PREPARE_FAILED'});throw error}
    })

    // Native tools, permissions, approval, filesystem, shell and runtime context
    // stay exactly with the mounted preset. Catalog role/methods grant no tools.
  }

  private replaceExpertTools(agent: Agent, binding: OfficialAgentBinding | null): void {
    this.expertTools.get(agent.id)?.()
    this.expertTools.delete(agent.id)
    if (!binding) return
    const extra = [
      ...(binding.kind === 'KNOWLEDGE' && binding.toolScope.includes(KNOWLEDGE_TOOL) ? [this.knowledgeTool(binding)] : []),
      ...(binding.toolScope.includes(WEB_SEARCH_TOOL) ? [this.webSearchTool(binding)] : []),
      ...(binding.toolScope.includes(WEB_FETCH_TOOL) ? [this.webFetchTool(binding)] : []),
      ...(binding.toolScope.includes(TABULAR_ANALYZE_TOOL) ? [this.tabularAnalyzeTool(binding)] : []),
      ...(binding.toolScope.includes(DELEGATE_TOOL) ? [this.delegateTool(binding)] : []),
    ]
    const disposers: (() => void)[] = []
    for (const definition of extra) {
      // Never shadow or remove an already registered native standard tool.
      if (!agent.ctx.tools.get(definition.name, agent)) disposers.push(agent.ctx.tools.register(definition))
    }
    this.expertTools.set(agent.id, () => { for (const dispose of disposers) dispose() })
  }

  private knowledgeTool(binding: OfficialAgentBinding): ToolDefinition {
    return {
      name: KNOWLEDGE_TOOL,
      description: 'Search the enterprise documents available to this official Expert. Use the returned document names and snippets as evidence, and tell the user when no relevant material is found.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'A focused search question or keywords.' } },
        required: ['query'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: async (args, exec) => {
        const { query } = querySchema.parse(args)
        await this.ground.resolve(binding.agentId, binding.versionId, exec.signal)
        const result = await this.ground.retrieve(binding.agentId, binding.versionId, query, exec.signal)
        return {
          hits: result.hits.map(hit => ({
            ...hit,
            sourceUrl: new URL(
              `/api/official-agents/${encodeURIComponent(binding.agentId)}/sources/${encodeURIComponent(hit.documentId)}?versionId=${encodeURIComponent(binding.versionId)}`,
              this.origin,
            ).href,
          })),
        }
      },
    }
  }

  private webSearchTool(binding: OfficialAgentBinding): ToolDefinition {
    return {
      name: WEB_SEARCH_TOOL,
      description: 'Search the public web for current information. Use returned titles, URLs, and snippets as evidence, and tell the user when nothing relevant is found. Do not invent sources.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'A focused web search question or keywords.' } },
        required: ['query'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: async (args, exec) => {
        const { query } = webSearchQuerySchema.parse(args)
        await this.ground.resolve(binding.agentId, binding.versionId, exec.signal)
        const result = await this.ground.search(binding.agentId, binding.versionId, query, exec.signal)
        return {
          provider: result.provider,
          hits: result.hits.map(hit => ({
            title: hit.title,
            url: hit.url,
            snippet: hit.snippet,
            ...hit.summary === undefined ? {} : { summary: hit.summary },
            ...hit.publishedAt === undefined ? {} : { publishedAt: hit.publishedAt },
            ...hit.siteName === undefined ? {} : { siteName: hit.siteName },
          })),
        }
      },
    }
  }

  private webFetchTool(binding: OfficialAgentBinding): ToolDefinition {
    return {
      name: WEB_FETCH_TOOL,
      description: 'Fetch one public http(s) page the user named. Return title, text excerpt, final URL, and access time. Do not invent page content. Private/local URLs are rejected.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'A public http or https URL.' } },
        required: ['url'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: async (args, exec) => {
        const { url } = webFetchSchema.parse(args)
        await this.ground.resolve(binding.agentId, binding.versionId, exec.signal)
        return this.ground.fetchUrl(binding.agentId, binding.versionId, url, exec.signal)
      },
    }
  }

  private tabularAnalyzeTool(binding: OfficialAgentBinding): ToolDefinition {
    return {
      name: TABULAR_ANALYZE_TOOL,
      description: 'Deterministically analyze inline CSV or JSON table content: column types, aggregates, optional group-by, and simple outliers. Pass the raw table text in content. Never invent numbers. If the user did not provide data, ask them to paste CSV/JSON instead of claiming a database connection.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Inline CSV or JSON table text from the user.' },
          format: { type: 'string', enum: ['csv', 'json', 'auto'], description: 'Optional format hint.' },
          groupBy: { type: 'string', description: 'Optional column name to group by.' },
          metrics: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional numeric columns to aggregate when grouping.',
          },
          goal: { type: 'string', description: 'Optional analysis goal (e.g. 按城市汇总). Used by Ground to infer groupBy when omitted.' },
        },
        required: ['content'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: async (args, exec) => {
        const parsed = tabularSchema.parse(args)
        await this.ground.resolve(binding.agentId, binding.versionId, exec.signal)
        const body: {
          content: string
          format?: 'csv' | 'json' | 'auto'
          groupBy?: string
          metrics?: string[]
          goal?: string
        } = { content: parsed.content }
        if (parsed.format !== undefined) body.format = parsed.format
        if (parsed.groupBy !== undefined) body.groupBy = parsed.groupBy
        if (parsed.metrics !== undefined) body.metrics = parsed.metrics
        if (parsed.goal !== undefined) body.goal = parsed.goal
        return this.ground.analyzeTabular(binding.agentId, binding.versionId, body, exec.signal)
      },
    }
  }

  private delegateTool(binding: OfficialAgentBinding): ToolDefinition {
    return {
      name: DELEGATE_TOOL,
      description: 'Route one user request to a single official specialist agent (mammoth, copy, data, spy, growth, or xhs), run its allowed tools on Ground, and return the specialist answer. Only one hop; do not delegate to boss. Prefer the specialist whose tools match the task.',
      parameters: {
        type: 'object',
        properties: {
          targetKey: {
            type: 'string',
            description: 'Official agent key to delegate to: mammoth | copy | data | spy | growth | xhs',
          },
          task: { type: 'string', description: 'The concrete task for the specialist.' },
          tabularContent: { type: 'string', description: 'Optional inline CSV/JSON when targetKey is data.' },
          tabularFormat: { type: 'string', enum: ['csv', 'json', 'auto'] },
        },
        required: ['targetKey', 'task'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: async (args, exec) => {
        const parsed = delegateSchema.parse(args)
        await this.ground.resolve(binding.agentId, binding.versionId, exec.signal)
        const body: {
          targetKey: string
          task: string
          tabularContent?: string
          tabularFormat?: 'csv' | 'json' | 'auto'
        } = { targetKey: parsed.targetKey, task: parsed.task }
        if (parsed.tabularContent !== undefined) body.tabularContent = parsed.tabularContent
        if (parsed.tabularFormat !== undefined) body.tabularFormat = parsed.tabularFormat
        return this.ground.delegate(binding.agentId, binding.versionId, body, exec.signal)
      },
    }
  }

}

declare module '@mammoth-ai/cordis' { interface Events { 'task/dispose-owned'(sessionId: SessionId): Promise<void> } }

declare module '@mammoth-ai/cordis' { interface Events { 'task/check-queue-steer'(agent: Agent, message: import('@mammoth-ai/mmp-llm').UserMessage): Promise<void> } }


