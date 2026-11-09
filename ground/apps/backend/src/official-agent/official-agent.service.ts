import { expertDiscoveryDetail } from './discovery-detail';
import { catalogQuery, catalogFacets, catalogDiscoveryWhere, discoveryOf, displaySummary, DESCRIPTIONS, nextCatalogCursor, type CatalogQuery } from './catalog-discovery';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OfficialAgentGrantStatus,
  OfficialAgentKind,
  OfficialAgentStatus,
  Prisma,
  TenantType,
  User,
} from '@prisma/client';
import { expertExecutionPrompt } from './expert-definition';
import type { SkillSummary } from '../official-skill/official-skill.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { OfficialWebSearchService, WEB_SEARCH_TOOL } from './web-search.service';
import { OfficialWebFetchService, WEB_FETCH_TOOL } from './web-fetch.service';
import { OfficialTabularAnalyzeService, TABULAR_ANALYZE_TOOL } from './tabular-analyze.service';
import { OfficialOrchestrateService, DELEGATE_OFFICIAL_AGENT_TOOL } from './orchestrate.service';
import { OfficialKbService } from './official-kb.service';
import { OfficialSkillService } from '../official-skill/official-skill.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { buildPublicCapabilities } from './gallery-presentation';
import { loadOfficialAgentAssets, loadOfficialAgentAvatarRef } from './official-agent-assets';
import { resolvePresentedOfficialAvatarUrl } from './gallery-avatars';

const grantedAgentInclude = {
  agent: true,
  version: true,
} satisfies Prisma.OfficialAgentTenantGrantInclude;

type GrantedAgentRow = Prisma.OfficialAgentTenantGrantGetPayload<{
  include: typeof grantedAgentInclude;
}>;

export type OfficialAgentExecution = {
  agentId: string;
  key: string;
  kind: OfficialAgentKind;
  versionId: string;
  version: number;
  systemPrompt: string;
  toolScope: string[];
  /** 当前关联且启用的技能摘要；Host 冻结到新会话，不含正文。 */
  linkedSkills: Array<{
    id: string;
    key: string;
    name: string;
    summary: string;
    category: string | null;
    packageRevision: number;
    enabledAt: string | null;
  }>;
};

const CATALOG_EXPERT_SELECT={id:true,key:true,kind:true,category:true,capabilities:true,customAvatarPath:true,onlineVersion:{select:{id:true,version:true,name:true,summary:true,openingQuestions:true,toolScope:true,expertDefinition:true,linkedSkillSummaries:true,customAvatarPath:true}}} as const;

@Injectable()
export class OfficialAgentService {
  constructor(
    private prisma: PrismaService,
    private tenants: TenantService,
    private knowledge: KnowledgeService,
    private officialKb: OfficialKbService,
    private officialSkills: OfficialSkillService,
    private webSearchProvider: OfficialWebSearchService,
    private webFetchProvider: OfficialWebFetchService,
    private tabularAnalyze: OfficialTabularAnalyzeService,
    private orchestrate: OfficialOrchestrateService,
  ) {}

  /**
   * 第一阶段：全员可见且可执行的已发布官方专家目录。
   * grant 表仍保留供后续套餐使用，但不再作为可见/执行前置。
   * 公开字段不含 systemPrompt / toolScope / kbFolderIds。
   */
  async list(user: User, _tenantId: string | null) {
    this.requireActiveAccount(user);
    const agents = await this.prisma.officialAgent.findMany({
      where: {
        status: OfficialAgentStatus.PUBLISHED,
        onlineVersionId: { not: null },
      },
      include: {
        onlineVersion: true,
        skillLinks: { select: { skillId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const avatarByKey = new Map(
      loadOfficialAgentAssets().map((asset) => [asset.key, asset.avatar ?? null] as const),
    );
    const cards = [];
    for (const agent of agents) {
      if (!agent.onlineVersion) continue;
      const linkedSkills = await this.versionLinkedSkills(agent.id, agent.onlineVersion, agent.skillLinks.map(link => link.skillId));
      cards.push({
        ...this.publicCatalogCard(agent, true, avatarByKey.get(agent.key) ?? null),
        linkedSkills,
      });
    }
    return cards;
  }

  /**
   * 每轮模型调用前重新核验：账号有效、专家已发布、版本归属正确。
   * 不再要求企业 ACTIVE grant；平台工作区也可 resolve。
   */
  async resolve(
    user: User,
    tenantId: string | null,
    agentId: string,
    versionId?: string,
  ): Promise<OfficialAgentExecution> {
    const { agent, version } = await this.resolvePublishedVersion(user, agentId, versionId);
    const linkedSkills = await this.versionLinkedSkills(agent.id, version);
    return {
      agentId: agent.id,
      key: agent.key,
      kind: agent.kind,
      versionId: version.id,
      version: version.version,
      systemPrompt: expertExecutionPrompt(version.systemPrompt, version.expertDefinition),
      toolScope: stringList(version.toolScope),
      linkedSkills,
    };
  }

  async catalogFacets(user:User){this.requireActiveAccount(user);const rows=await this.prisma.officialAgent.findMany({where:{status:OfficialAgentStatus.PUBLISHED,onlineVersionId:{not:null}},select:{key:true,category:true}});return catalogFacets('expert',rows.map(x=>({key:x.key,category:x.category})));}
  async catalogCard(user:User,id:string){this.requireActiveAccount(user);const row=await this.prisma.officialAgent.findFirst({where:{id,status:OfficialAgentStatus.PUBLISHED,onlineVersionId:{not:null}},select:CATALOG_EXPERT_SELECT});if(!row?.onlineVersion)throw new NotFoundException('专家不可用');return {...this.publicCatalogCard(row,true,loadOfficialAgentAvatarRef(row.key)),linkedSkills:await this.versionLinkedSkills(row.id,row.onlineVersion)};}
  async catalogDetail(user:User,id:string){
    const card=await this.catalogCard(user,id);
    // Read the exact online version used by the card, never mutable draft metadata.
    const version=await this.prisma.officialAgentVersion.findFirst({where:{id:card.versionId,agentId:id,onlineFor:{status:OfficialAgentStatus.PUBLISHED}},select:{expertDefinition:true}});
    if(!version)throw new NotFoundException('专家公开版本已变更，请刷新');
    return {kind:'expert' as const,id:card.id,key:card.key,name:card.name,summary:displaySummary(card.key,card.summary),avatarUrl:card.avatarUrl,versionId:card.versionId,detail:expertDiscoveryDetail(version.expertDefinition,card.openingQuestions),linkedSkills:(card.linkedSkills??[]).map(skill=>({id:skill.id,name:skill.name,summary:skill.summary}))};
  }

  async catalogPage(user:User,query:CatalogQuery){
    this.requireActiveAccount(user);const f=catalogQuery(query,'expert');const filters:Prisma.OfficialAgentWhereInput[]=[{status:OfficialAgentStatus.PUBLISHED,onlineVersionId:{not:null}}];
    if(f.capability!=='all'||f.industry!=='all')filters.push(catalogDiscoveryWhere('expert',f.capability,f.industry));
    if(f.q)filters.push({OR:[{key:{contains:f.q,mode:'insensitive'}},{onlineVersion:{is:{OR:[{name:{contains:f.q,mode:'insensitive'}},{summary:{contains:f.q,mode:'insensitive'}}]}}},...Object.entries(DESCRIPTIONS).filter(([,v])=>v.summary.toLocaleLowerCase().includes(f.q.toLocaleLowerCase())).map(([key,v])=>({key,onlineVersion:{is:{summary:v.expectedOriginal}}}))]});
    const where:Prisma.OfficialAgentWhereInput={AND:filters};const [total,rows]=await this.prisma.$transaction([this.prisma.officialAgent.count({where}),this.prisma.officialAgent.findMany({where:{AND:[where,...f.after?[{key:{gt:f.after}}]:[]]},orderBy:{key:'asc'},take:21,select:CATALOG_EXPERT_SELECT})],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    const page=rows.slice(0,20);const items=await Promise.all(page.map(async row=>({...this.publicCatalogCard(row,true,loadOfficialAgentAvatarRef(row.key)),summary:displaySummary(row.key,row.onlineVersion!.summary),discovery:discoveryOf('expert',row.key,row.category),linkedSkills:await this.versionLinkedSkills(row.id,row.onlineVersion!)})));
    return {items,total,hasMore:rows.length>20,nextCursor:rows.length>20?nextCatalogCursor(page[page.length-1]!.key,f.signature):null};
  }

  /** New versions use their frozen summaries; legacy versions retain their existing compatibility path. */
  private async versionLinkedSkills(agentId: string, version: { expertDefinition: Prisma.JsonValue; linkedSkillSummaries: Prisma.JsonValue }, legacyIds?: string[]): Promise<SkillSummary[]> {
    const definition = version.expertDefinition;
    if (!definition || typeof definition !== 'object' || Array.isArray(definition) || definition.schemaVersion !== 1) {
      return this.officialSkills.summarizeEnabledSkills(legacyIds ?? await this.officialSkills.listAgentLinkedSkillIds(agentId));
    }
    const frozen = (Array.isArray(version.linkedSkillSummaries) ? version.linkedSkillSummaries : []).filter((item): item is Prisma.JsonObject => !!item && typeof item === 'object' && !Array.isArray(item));
    const ids = frozen.flatMap(item => typeof item.id === 'string' ? [item.id] : []);
    const enabled = new Set((await this.officialSkills.summarizeEnabledSkills(ids)).map(item => item.id));
    return frozen.filter(item => typeof item.id === 'string' && enabled.has(item.id) && typeof item.key === 'string' && typeof item.name === 'string' && typeof item.summary === 'string' && typeof item.packageRevision === 'number').map(item => ({
      id: item.id as string, key: item.key as string, name: item.name as string, summary: item.summary as string,
      category: typeof item.category === 'string' ? item.category as SkillSummary['category'] : null,
      packageRevision: item.packageRevision as number, enabledAt: typeof item.enabledAt === 'string' ? item.enabledAt : null,
    }));
  }

  async retrieve(
    user: User,
    tenantId: string | null,
    agentId: string,
    versionId: string | undefined,
    query: string,
  ) {
    const { agent, version } = await this.resolvePublishedVersion(user, agentId, versionId);
    if (await this.officialKb.hasDocuments(agent.id)) {
      const result = await this.officialKb.search(agent.id, query);
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          tenantId: tenantId ?? null,
          action: 'official_agent_retrieve',
          meta: {
            agentId: agent.id,
            versionId: version.id,
            scope: 'official_kb',
            hitCount: result.hits.length,
            // 不记录 query/正文
          },
        },
      });
      return result;
    }
    // 兼容企业资料型专家：仍走企业私库 + grant.kbFolderIds，绝不回落到官方库。
    this.requireKnowledgeKind(agent.kind);
    const grant = await this.loadActiveGrant(user, tenantId, agent.id);
    return this.knowledge.search(user, tenantId, query, this.folderIds(grant));
  }

  /**
   * 官方专家联网搜索：按冻结版本 toolScope 校验，经 Ground 调用平台 DeepSeek Search，
   * 不把搜索密钥下发到客户端。
   */
  async webSearch(
    user: User,
    tenantId: string | null,
    agentId: string,
    versionId: string | undefined,
    query: string,
  ) {
    const { agent, version } = await this.resolvePublishedVersion(user, agentId, versionId);
    const scope = stringList(version.toolScope);
    if (!scope.includes(WEB_SEARCH_TOOL)) {
      throw new ForbiddenException('当前专家版本未授权联网搜索');
    }
    const q = query.trim();
    if (!q) throw new BadRequestException('搜索词不能为空');
    const result = await this.webSearchProvider.search(q);
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        tenantId: tenantId ?? null,
        action: 'official_agent_web_search',
        meta: {
          agentId: agent.id,
          versionId: version.id,
          query: q.slice(0, 200),
          hitCount: result.hits.length,
          provider: result.provider,
        },
      },
    });
    return result;
  }


  /**
   * 表格确定性分析：按冻结版本 toolScope 校验，数值由服务端计算。
   */
  async analyzeTabular(
    user: User,
    tenantId: string | null,
    agentId: string,
    versionId: string | undefined,
    body: {
      content: string;
      format?: 'csv' | 'json' | 'auto';
      groupBy?: string;
      metrics?: string[];
      goal?: string;
    },
  ) {
    const { agent, version } = await this.resolvePublishedVersion(user, agentId, versionId);
    const scope = stringList(version.toolScope);
    if (!scope.includes(TABULAR_ANALYZE_TOOL)) {
      throw new ForbiddenException('当前专家版本未授权表格分析');
    }
    const result = this.tabularAnalyze.analyze(body);
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        tenantId: tenantId ?? null,
        action: 'official_agent_tabular_analyze',
        meta: {
          agentId: agent.id,
          versionId: version.id,
          format: result.format,
          rowCount: result.rowCount,
          columnCount: result.columnCount,
          appliedGroupBy: result.appliedGroupBy ?? null,
          groupCount: result.groupSummary?.length ?? 0,
          // 不记录表格正文
        },
      },
    });
    return result;
  }

  /**
   * 公开网页读取：按冻结版本 toolScope 校验，防 SSRF，不下发密钥。
   */
  async fetchUrl(
    user: User,
    tenantId: string | null,
    agentId: string,
    versionId: string | undefined,
    url: string,
  ) {
    const { agent, version } = await this.resolvePublishedVersion(user, agentId, versionId);
    const scope = stringList(version.toolScope);
    if (!scope.includes(WEB_FETCH_TOOL)) {
      throw new ForbiddenException('当前专家版本未授权网页读取');
    }
    const result = await this.webFetchProvider.fetchUrl(url);
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        tenantId: tenantId ?? null,
        action: 'official_agent_web_fetch',
        meta: {
          agentId: agent.id,
          versionId: version.id,
          status: result.status,
          finalUrl: result.finalUrl.slice(0, 500),
          accessedAt: result.accessedAt,
          truncated: result.truncated,
          // 不记录正文
        },
      },
    });
    return result;
  }

  /**
   * 大总管单层委派：校验 boss toolScope 后交编排服务执行。
   */
  async delegate(
    user: User,
    tenantId: string | null,
    agentId: string,
    versionId: string | undefined,
    body: {
      targetKey: string;
      task: string;
      tabularContent?: string;
      tabularFormat?: 'csv' | 'json' | 'auto';
    },
  ) {
    const { agent, version } = await this.resolvePublishedVersion(user, agentId, versionId);
    const scope = stringList(version.toolScope);
    if (!scope.includes(DELEGATE_OFFICIAL_AGENT_TOOL)) {
      throw new ForbiddenException('当前专家版本未授权编排委派');
    }
    if (agent.key !== 'boss') {
      throw new ForbiddenException('仅猛犸大总管可委派其它官方专家');
    }
    const result = await this.orchestrate.delegate(user, tenantId, agent.id, version, body);
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        tenantId: tenantId ?? null,
        action: 'official_agent_delegate',
        meta: {
          agentId: agent.id,
          versionId: version.id,
          targetKey: result.route.key,
          targetAgentId: result.route.agentId,
          targetVersionId: result.route.versionId,
          toolTraceCount: result.toolTrace.length,
          depth: result.depth,
          // 不记录任务正文与子答案
        },
      },
    });
    return result;
  }

  async source(
    user: User,
    tenantId: string | null,
    agentId: string,
    versionId: string | undefined,
    documentId: string,
  ) {
    const { agent } = await this.resolvePublishedVersion(user, agentId, versionId);
    if (await this.officialKb.hasDocuments(agent.id)) {
      return this.officialKb.file(agent.id, documentId);
    }
    this.requireKnowledgeKind(agent.kind);
    const grant = await this.loadActiveGrant(user, tenantId, agent.id);
    return this.knowledge.file(user, tenantId, documentId, true, this.folderIds(grant));
  }

  /** Console 只列当前企业已开通、且无官方知识资产的资料型专家（企业私库绑定）。 */
  async consoleList(user: User, tenantId: string | null) {
    const id = await this.requireScopeAdmin(user, tenantId);
    const grants = await this.prisma.officialAgentTenantGrant.findMany({
      where: {
        tenantId: id,
        status: OfficialAgentGrantStatus.ACTIVE,
        agent: { status: OfficialAgentStatus.PUBLISHED, kind: OfficialAgentKind.KNOWLEDGE },
      },
      include: {
        ...grantedAgentInclude,
        agent: { include: { officialDocuments: { select: { id: true }, take: 1 } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return grants
      .filter((grant) => grant.version.agentId === grant.agentId)
      .filter((grant) => grant.agent.officialDocuments.length === 0)
      .map((grant) => ({
        ...this.publicCard(grant),
        kbFolderIds: this.folderIds(grant),
      }));
  }

  async updateScope(
    user: User,
    tenantId: string | null,
    agentId: string,
    kbFolderIds: string[],
  ) {
    const id = await this.requireScopeAdmin(user, tenantId);
    if (await this.officialKb.hasDocuments(agentId)) {
      throw new BadRequestException('官方知识资产专家不支持绑定企业资料目录');
    }
    const grant = await this.prisma.officialAgentTenantGrant.findUnique({
      where: { agentId_tenantId: { agentId, tenantId: id } },
      include: grantedAgentInclude,
    });
    if (
      !grant || grant.status !== OfficialAgentGrantStatus.ACTIVE ||
      grant.agent.status !== OfficialAgentStatus.PUBLISHED ||
      grant.agent.kind !== OfficialAgentKind.KNOWLEDGE
    ) {
      throw new NotFoundException('资料型专家不存在或尚未开通');
    }
    const folderIds = [...new Set(kbFolderIds.map((value) => value.trim()).filter(Boolean))];
    if (folderIds.length > 0) {
      const owned = await this.prisma.kbFolder.count({ where: { tenantId: id, id: { in: folderIds } } });
      if (owned !== folderIds.length) throw new BadRequestException('只能选择当前企业的资料目录');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.officialAgentTenantGrant.update({
        where: { id: grant.id },
        data: { kbFolderIds: folderIds },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          tenantId: id,
          action: 'update_official_agent_kb_scope',
          meta: { agentId, versionId: grant.versionId, kbFolderIds: folderIds },
        },
      });
    });
    return {
      ...this.publicCard(grant),
      kbFolderIds: folderIds,
    };
  }

  private publicCard(grant: GrantedAgentRow) {
    return {
      id: grant.agentId,
      key: grant.agent.key,
      kind: grant.agent.kind,
      category: grant.agent.category,
      versionId: grant.version.id,
      version: grant.version.version,
      name: grant.version.name,
      summary: grant.version.summary,
      openingQuestions: stringList(grant.version.openingQuestions),
      capabilities: buildPublicCapabilities(grant.version.toolScope, grant.agent.capabilities),
      avatarUrl: this.resolveAvatarUrl(
        grant.agent.key,
        null,
        grant.version.customAvatarPath ?? grant.agent.customAvatarPath ?? null,
      ),
      executionGranted: true,
    };
  }

  private publicCatalogCard(
    agent: {
      id: string;
      key: string;
      kind: OfficialAgentKind;
      category: import('@prisma/client').OfficialAgentCategory | null;
      capabilities: Prisma.JsonValue;
      customAvatarPath?: string | null;
      onlineVersion: {
        id: string;
        version: number;
        name: string;
        summary: string;
        openingQuestions: Prisma.JsonValue;
        toolScope: Prisma.JsonValue;
        customAvatarPath?: string | null;
      } | null;
    },
    executionGranted: boolean,
    explicitAvatar: string | null = null,
  ) {
    const version = agent.onlineVersion;
    if (!version) throw new NotFoundException('专家尚未发布版本');
    // Terminal reads published avatar only; draft parent customAvatarPath is Admin preview.
    return {
      id: agent.id,
      key: agent.key,
      kind: agent.kind,
      category: agent.category,
      versionId: version.id,
      version: version.version,
      name: version.name,
      summary: version.summary,
      openingQuestions: stringList(version.openingQuestions),
      capabilities: buildPublicCapabilities(version.toolScope, agent.capabilities),
      avatarUrl: this.resolveAvatarUrl(
        agent.key,
        explicitAvatar,
        version.customAvatarPath ?? null,
      ),
      executionGranted,
    };
  }

  /**
   * Public branding URL. Priority: Admin custom upload → packaged asset default.
   * Null means clients should show a functional role icon.
   */
  private resolveAvatarUrl(
    key: string,
    explicitAvatar: string | null = null,
    customAvatarPath: string | null = null,
  ): string | null {
    return resolvePresentedOfficialAvatarUrl({
      key,
      customAvatarPath,
      explicitAssetAvatar: explicitAvatar,
    });
  }

  private async resolvePublishedVersion(user: User, agentId: string, versionId?: string) {
    this.requireActiveAccount(user);
    const agent = await this.prisma.officialAgent.findUnique({ where: { id: agentId } });
    if (!agent || agent.status !== OfficialAgentStatus.PUBLISHED || !agent.onlineVersionId) {
      throw new ForbiddenException('专家已下架或不可用');
    }
    const selectedVersionId = versionId ?? agent.onlineVersionId;
    const version = await this.prisma.officialAgentVersion.findFirst({
      where: { id: selectedVersionId, agentId },
    });
    if (!version) throw new ForbiddenException('会话绑定的专家版本无效，请重新从广场进入');
    return { agent, version };
  }

  /**
   * 企业私库检索仍需 ACTIVE grant（保留套餐数据结构），但不影响官方库与开聊。
   */
  private async loadActiveGrant(user: User, tenantId: string | null, agentId: string) {
    const id = await this.requireActiveMember(user, tenantId);
    const grant = await this.prisma.officialAgentTenantGrant.findUnique({
      where: { agentId_tenantId: { agentId, tenantId: id } },
      include: grantedAgentInclude,
    });
    if (!grant || grant.status !== OfficialAgentGrantStatus.ACTIVE) {
      throw new ForbiddenException('当前企业未配置该资料型专家的企业资料范围');
    }
    return grant;
  }

  private requireActiveAccount(user: User) {
    if (user.status !== 'active') throw new ForbiddenException('当前账号已停用');
  }

  private async requireActiveMember(user: User, tenantId: string | null) {
    if (!tenantId) throw new BadRequestException('请先选择企业');
    this.requireActiveAccount(user);
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, type: TenantType.ENTERPRISE, status: 'active' },
      select: { id: true },
    });
    if (!tenant) throw new ForbiddenException('企业不存在或已停用');
    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException('当前账号不是该企业成员');
    return tenant.id;
  }

  private async requireScopeAdmin(user: User, tenantId: string | null) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.kb');
    await this.tenants.assertOrgAdmin(user, id);
    return id;
  }

  private requireKnowledgeKind(kind: OfficialAgentKind) {
    if (kind !== OfficialAgentKind.KNOWLEDGE) {
      throw new BadRequestException('该专家不支持资料检索');
    }
  }

  private folderIds(grant: GrantedAgentRow) {
    return stringList(grant.kbFolderIds);
  }
}

function stringList(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}
