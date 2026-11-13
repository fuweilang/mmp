import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  catalogQuery,
  catalogFacets,
  catalogDiscoveryWhere,
  discoveryOf,
  displaySummary,
  DESCRIPTIONS,
  nextCatalogCursor,
  type CatalogQuery,
} from '../official-agent/catalog-discovery';
import { normalizeDiscoveryDetail, publicDiscoveryDetail } from '../official-agent/discovery-detail';
import { uploadedCatalogIconUrl } from '../official-agent/gallery-avatars';
import { absoluteUploadPath } from '../knowledge/storage';
import { completeSkillManifest, skillPackageStats } from './skill-package-format';
import { skillDiscovery } from './skill-discovery';
import {
  legacySkillCategory,
  primarySkillCategory,
  skillPackageError,
  type OfficialSkillCategoryKey,
} from './skill-package';
import { skillOfferedForNewUse } from './skill-workflow';
import { PrismaService } from '../prisma/prisma.service';
import { LlmChatGatewayService } from '../llm/llm-chat.gateway.service';
import {
  skillInclude,
  type SkillRow,
  OfficialSkillPackageService,
} from './official-skill-package.service';
import { OfficialSkillLifecycleService } from './official-skill-lifecycle.service';
import { OfficialSkillPublicService } from './official-skill-public.service';
import {
  OfficialSkillDisplayTranslationService,
  type SkillDisplayCompletionPort,
} from './official-skill-display-translation.service';
import {
  listAgentLinkedSkillIds as listAgentLinkedSkillIdsOf,
  setAgentSkillLinks as setAgentSkillLinksOf,
  snapshotLinkedSkills as snapshotLinkedSkillsOf,
  summarizeEnabledSkills as summarizeEnabledSkillsOf,
  type SkillSummary,
} from './official-skill-links';

export type { SkillSummary } from './official-skill-links';

/**
 * 官方技能组合入口（审计 P1-3 拆分后的门面）。
 *
 * 构造签名 `(prisma, llm)` 保持不变（测试按位置实例化）。
 * 职责簇：package（导入/替换）· lifecycle（启停/删除/图标）· public（客户端读取）
 * · display-translation（唯一的 LLM 调用，走窄端口断开与 llm 模块的新依赖边）。
 *
 * 下面标 `internal` 的成员原为 private，拆分后由职责簇以 `host` 身份调用；
 * 仓内除本目录的职责簇外无其他调用方。
 */
@Injectable()
export class OfficialSkillService {
  private readonly packages: OfficialSkillPackageService;
  private readonly lifecycle: OfficialSkillLifecycleService;
  private readonly publicSkills: OfficialSkillPublicService;
  private readonly translation: OfficialSkillDisplayTranslationService;

  constructor(
    readonly prisma: PrismaService,
    private llm: LlmChatGatewayService,
  ) {
    this.packages = new OfficialSkillPackageService(this);
    this.lifecycle = new OfficialSkillLifecycleService(this, this.packages);
    this.publicSkills = new OfficialSkillPublicService(this);
    this.translation = new OfficialSkillDisplayTranslationService(
      prisma,
      llm as unknown as SkillDisplayCompletionPort,
    );
  }

  // ---- 管理端列表/详情/发现/目录（保留在门面） ----

  async catalogFacets(){const rows=await this.prisma.officialSkill.findMany({where:{deletedAt:null,enabledAt:{not:null},currentRevision:{gt:0}},select:{key:true}});return catalogFacets('skill',rows.map(x=>x.key));}
  async catalogPage(query:CatalogQuery){
    const f=catalogQuery(query,'skill');const filters:Prisma.OfficialSkillWhereInput[]=[{deletedAt:null,enabledAt:{not:null},currentRevision:{gt:0}}];
    if(f.capability!=='all'||f.industry!=='all')filters.push(catalogDiscoveryWhere('skill',f.capability,f.industry));
    if(f.q)filters.push({OR:[...['name','summary','key'].map(field=>({[field]:{contains:f.q,mode:'insensitive' as const}})),...Object.entries(DESCRIPTIONS).filter(([,v])=>v.summary.toLocaleLowerCase().includes(f.q.toLocaleLowerCase())).map(([key,v])=>({key,summary:v.expectedOriginal}))]});
    const where:Prisma.OfficialSkillWhereInput={AND:filters};
    const [total,rows]=await Promise.all([this.prisma.officialSkill.count({where}),this.prisma.officialSkill.findMany({where:{AND:[where,...f.after?[{key:{gt:f.after}}]:[]]},orderBy:{key:'asc'},take:21,select:{id:true,key:true,name:true,summary:true,categories:true,enabledAt:true,currentRevision:true,customAvatarPath:true}})]);
    const page=rows.slice(0,20);return {items:page.map(row=>({id:row.id,key:row.key,name:row.name,summary:displaySummary(row.key,row.summary),category:primarySkillCategory(row.categories),enabledAt:row.enabledAt?.toISOString()??null,packageRevision:row.currentRevision,avatarUrl:uploadedCatalogIconUrl(row.customAvatarPath),discovery:discoveryOf('skill',row.key)})),total,hasMore:rows.length>20,nextCursor:rows.length>20?nextCatalogCursor(page[page.length-1]!.key,f.signature):null};
  }

  async discovery(id:string){const row=await this.requireSkill(id);return {id:row.id,name:row.name,enabled:Boolean(row.enabledAt),updatedAt:row.updatedAt.toISOString(),discoveryDetail:publicDiscoveryDetail(row.discoveryDetail)};}

  async saveDiscovery(actor:User,id:string,body:{expectedUpdatedAt:string;discoveryDetail:unknown}) {
    await this.prisma.$transaction(async tx=>{
      const row=await tx.officialSkill.findUnique({where:{id}});
      if(!row)throw new NotFoundException('技能不存在');
      if(row.updatedAt.toISOString()!==body.expectedUpdatedAt)throw new ConflictException('技能已更新，请重新打开后保存');
      const detail=normalizeDiscoveryDetail(body.discoveryDetail,row.discoveryDetail);
      const result=await tx.officialSkill.updateMany({where:{id,updatedAt:row.updatedAt},data:{discoveryDetail:detail}});
      if(result.count!==1)throw new ConflictException('技能已更新，请重新打开后保存');
      await tx.auditLog.create({data:{userId:actor.id,action:'admin_update_official_skill',meta:{skillId:id,fields:['discoveryDetail']}}});
    });
    return this.adminDetail(id,{includeInstruction:true});
  }
  async availability(user: User, id: string) {
    this.requireActiveAccount(user);
    const row = await this.prisma.officialSkill.findUnique({
      where: { id },
      select: { id: true, name: true, deletedAt: true, enabledAt: true, currentRevision: true },
    });
    if (!row) throw new NotFoundException('技能不存在');
    return {
      id: row.id,
      name: row.name,
      deleted: Boolean(row.deletedAt),
      selectable: skillOfferedForNewUse({
        deletedAt: row.deletedAt,
        enabledAt: row.enabledAt,
        revision: row.currentRevision,
      }),
    };
  }

  async catalogDetail(user:User,id:string){
    this.requireActiveAccount(user);
    const row=await this.prisma.officialSkill.findFirst({where:{id,deletedAt:null,enabledAt:{not:null},currentRevision:{gt:0}},select:{id:true,key:true,name:true,summary:true,categories:true,enabledAt:true,currentRevision:true,customAvatarPath:true,discoveryDetail:true}});
    if(!row)throw new NotFoundException('技能不可用');
    return {kind:'skill' as const,id:row.id,key:row.key,name:row.name,summary:displaySummary(row.key,row.summary),avatarUrl:uploadedCatalogIconUrl(row.customAvatarPath),packageRevision:row.currentRevision,discovery:discoveryOf('skill',row.key),detail:publicDiscoveryDetail(row.discoveryDetail),linkedSkills:[]};
  }

  async adminList(query: { keyword?: string; enabled?: 'true' | 'false' | '' }) {
    const keyword = query.keyword?.trim();
    const enabled =
      query.enabled === 'true' ? true : query.enabled === 'false' ? false : undefined;
    const rows = await this.prisma.officialSkill.findMany({
      where: {
        deletedAt: null,
        ...(enabled === true ? { enabledAt: { not: null } } : {}),
        ...(enabled === false ? { enabledAt: null } : {}),
        ...(keyword
          ? {
              OR: [
                { name: { contains: keyword, mode: 'insensitive' } },
                { key: { contains: keyword, mode: 'insensitive' } },
                { summary: { contains: keyword, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: skillInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.presentAdmin(row));
  }

  async adminDetail(id: string, opts: { includeInstruction?: boolean } = {}) {
    const row = await this.requireSkill(id);
    const presented = this.presentAdmin(row);
    if (!opts.includeInstruction) return presented;
    const instruction = await this.readInstruction(row);
    return { ...presented, instruction };
  }

  async listEnabledOptions() {
    const rows = await this.prisma.officialSkill.findMany({
      where: { deletedAt: null, enabledAt: { not: null }, currentRevision: { gt: 0 } },
      select: {
        id: true,
        key: true,
        name: true,
        summary: true,
        categories: true,
        currentRevision: true,
        enabledAt: true,
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      summary: row.summary,
      category: primarySkillCategory(row.categories),
      categories: row.categories,
      packageRevision: row.currentRevision,
      enabledAt: row.enabledAt?.toISOString() ?? null,
    }));
  }

  // ---- 技能包导入/替换（package 簇） ----

  validateZip(file?: { buffer: Buffer; originalname?: string }) {
    return this.packages.validateZip(file);
  }

  createFromZip(
    actor: User,
    file: { buffer: Buffer; originalname?: string } | undefined,
    overrides: { name?: string; summary?: string; category?: string | null; categories?: unknown },
  ) {
    return this.packages.createFromZip(actor, file, overrides);
  }

  createFromForm(
    actor: User,
    body: { key?: string; name: string; summary?: string; category?: string | null; categories?: unknown; instruction?: string },
  ) {
    return this.packages.createFromForm(actor, body);
  }

  updateMeta(
    actor: User,
    id: string,
    body: {
      name?: string;
      summary?: string;
      category?: string | null;
      categories?: unknown;
      instruction?: string;
      expectedUpdatedAt?: string;
      linkedOnly?: boolean;
    },
  ) {
    return this.packages.updateMeta(actor, id, body);
  }

  replaceZip(
    actor: User,
    id: string,
    file: { buffer: Buffer; originalname?: string } | undefined,
    overrides: { name?: string; summary?: string; category?: string | null; categories?: unknown; expectedUpdatedAt?: string },
  ) {
    return this.packages.replaceZip(actor, id, file, overrides);
  }

  // ---- 生命周期（lifecycle 簇） ----

  setIcon(id:string,file?:{originalname:string;mimetype:string;buffer:Buffer},actorId?:string,expectedUpdatedAt?:string) {
    return this.lifecycle.setIcon(id,file,actorId,expectedUpdatedAt);
  }

  enable(actor: User, id: string) {
    return this.lifecycle.enable(actor, id);
  }

  disable(actor: User, id: string) {
    return this.lifecycle.disable(actor, id);
  }

  remove(actor: User, id: string) {
    return this.lifecycle.remove(actor, id);
  }

  // ---- 客户端公开读取（public 簇） ----

  publicList(query: { q?: string; category?: string; taxonomy?: 'industry' | 'facets' }) {
    return this.publicSkills.publicList(query);
  }

  publicContent(id: string, revision?: number, packageFormat?: number) {
    return this.publicSkills.publicContent(id, revision, packageFormat);
  }

  publicResource(id: string, resourcePath: string, revision?: number) {
    return this.publicSkills.publicResource(id, resourcePath, revision);
  }

  beginSession(user: User, id: string, expectedRevision?: number) {
    return this.publicSkills.beginSession(user, id, expectedRevision);
  }

  // ---- Agent ↔ Skill 关联与快照（links） ----

  summarizeEnabledSkills(skillIds: string[], tx?: Prisma.TransactionClient): Promise<SkillSummary[]> {
    return summarizeEnabledSkillsOf(this.prisma, skillIds, tx);
  }

  setAgentSkillLinks(agentId: string, skillIds: string[], tx?: Prisma.TransactionClient) {
    return setAgentSkillLinksOf(this.prisma, agentId, skillIds, tx);
  }

  listAgentLinkedSkillIds(agentId: string, tx?: Prisma.TransactionClient) {
    return listAgentLinkedSkillIdsOf(this.prisma, agentId, tx);
  }

  snapshotLinkedSkills(agentId: string, tx?: Prisma.TransactionClient): Promise<SkillSummary[]> {
    return snapshotLinkedSkillsOf(this.prisma, agentId, tx);
  }

  // ---- 展示文案机器翻译（display-translation 端口） ----

  translateDisplayBatch(
    actor: User,
    opts: { dryRun?: boolean; limit?: number; keys?: string[]; maxAttempts?: number } = {},
  ) {
    return this.translation.translateDisplayBatch(actor, opts);
  }

  // ---- 以下为职责簇共用的内部成员（原 private，无外部调用方） ----

  /** internal */
  async requireSkill(id: string) {
    const row = await this.prisma.officialSkill.findUnique({
      where: { id },
      include: skillInclude,
    });
    if (!row || row.deletedAt) throw new NotFoundException('官方技能不存在');
    return row;
  }

  /** internal */
  presentAdmin(row: SkillRow) {
    return {
      id: row.id,
      avatarUrl: uploadedCatalogIconUrl(row.customAvatarPath),
      key: row.key,
      name: row.name,
      summary: row.summary,
      category: primarySkillCategory(row.categories),
      categories: row.categories,
      enabledAt: row.enabledAt?.toISOString() ?? null,
      enabled: Boolean(row.enabledAt),
      packageRevision: row.currentRevision,
      contentSource: !row.currentPackage ? 'none' : row.currentPackage.sourceZipPath ? 'zip' : 'form',
      resourceCount: row.currentPackage?.resourceCount ?? 0,
      ...(row.currentPackage?.manifest && completeSkillManifest(row.currentPackage.manifest)?.files
        ? skillPackageStats(completeSkillManifest(row.currentPackage.manifest)!.files) : {}),
      instructionBytes: row.currentPackage?.instructionBytes ?? 0,
      discoveryDetail: publicDiscoveryDetail(row.discoveryDetail),
      linkedAgents: row.agentLinks.map((link) => ({
        id: link.agent.id,
        key: link.agent.key,
        name: link.agent.name,
      })),
      linkedAgentCount: row.agentLinks.length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** internal */
  publicCard(row: {
    id: string;
    key: string;
    name: string;
    summary: string;
    categories: OfficialSkillCategoryKey[];
    enabledAt: Date | null;
    currentRevision: number;
  }, industryTaxonomy = false) {
    const category = primarySkillCategory(row.categories);
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      summary: row.summary,
      category: industryTaxonomy ? category : legacySkillCategory(category),
      enabledAt: row.enabledAt?.toISOString() ?? null,
      packageRevision: row.currentRevision,
    };
  }

  /** internal */
  async readInstructionIfAny(row: SkillRow) {
    if (!row.currentPackage) return '';
    try {
      return await this.readInstructionFromPath(row.currentPackage.storagePath);
    } catch {
      return '';
    }
  }

  /** internal */
  async readInstructionFromPath(storagePath: string) {
    const abs = join(absoluteUploadPath(storagePath), 'SKILL.md');
    if (!existsSync(abs)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能说明缺失');
    }
    return readFile(abs, 'utf8');
  }

  /** internal */
  requireActiveAccount(user: User) {
    if (user.status !== 'active') throw new ForbiddenException('当前账号已停用');
  }

  /** internal */
  async audit(actorUserId: string, action: string, meta: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({
      data: { userId: actorUserId, action, tenantId: null, meta },
    });
  }

  /** internal */
  async auditTx(tx: Prisma.TransactionClient, actorUserId: string, action: string, meta: Prisma.InputJsonObject) {
    await tx.auditLog.create({ data: { userId: actorUserId, action, tenantId: null, meta } });
  }

  private async readInstruction(row: SkillRow) {
    if (!row.currentPackage) return '';
    return this.readInstructionFromPath(row.currentPackage.storagePath);
  }
}
