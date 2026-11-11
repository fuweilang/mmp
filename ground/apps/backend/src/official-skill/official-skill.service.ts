import { completeSkillManifest, isSkillPackagePath, skillPackageStats } from './skill-package-format';
import { normalizeDiscoveryDetail, publicDiscoveryDetail } from '../official-agent/discovery-detail';
import { catalogQuery, catalogFacets, catalogDiscoveryWhere, discoveryOf, displaySummary, DESCRIPTIONS, nextCatalogCursor, type CatalogQuery } from '../official-agent/catalog-discovery';
import { uploadedCatalogIconUrl } from '../official-agent/gallery-avatars';
import { absoluteUploadPath, officialSkillPackageRelDir, saveOfficialAvatar } from '../knowledge/storage';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { randomBytes } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { readFile, rm } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { LlmChatGatewayService } from '../llm/llm-chat.gateway.service';
import { skillDiscovery } from './skill-discovery';
import {
  ParsedSkillPackage,
  assertSkillDisplayName,
  assertSkillKey,
  assertSkillSummary,
  assignManifestCategories,
  buildSkillPackageFromForm,
  isOfficialSkillCategory,
  legacySkillCategory,
  packagePreview,
  parseSkillCategories,
  parseSkillZip,
  primarySkillCategory,
  retargetPackageKey,
  skillPackageError,
  storedCategories,
  writeSkillPackageToDisk,
  type OfficialSkillCategoryKey,
} from './skill-package';
import { assertFreshStamp, candidateSkillKeys, packageWriteClaim, planSkillDelete, skillDeletePatch, skillEnableGaps, skillEnableMessage, skillOfferedForNewUse, skillReadDecision, skillStartDecision, zipReplaceDecision } from './skill-workflow';
import {
  buildDisplayTranslationPrompt,
  displaySourceHash,
  needsMachineDisplayTranslation,
  parseDisplayTranslationJson,
} from './skill-display-i18n';

export type SkillSummary = {
  id: string;
  key: string;
  name: string;
  summary: string;
  category: OfficialSkillCategoryKey | null;
  packageRevision: number;
  enabledAt: string | null;
};

const skillInclude = {
  currentPackage: true,
  agentLinks: { select: { agentId: true, agent: { select: { id: true, key: true, name: true } } } },
} satisfies Prisma.OfficialSkillInclude;

type SkillRow = Prisma.OfficialSkillGetPayload<{ include: typeof skillInclude }>;

@Injectable()
export class OfficialSkillService {
  constructor(private prisma: PrismaService, private llm: LlmChatGatewayService) {}

  async setIcon(id:string,file?:{originalname:string;mimetype:string;buffer:Buffer},actorId?:string,expectedUpdatedAt?:string) {
    const row=await this.requireSkill(id);
    assertFreshStamp(row.updatedAt.toISOString(),expectedUpdatedAt);
    let path:string|null=null;
    if(file){try{path=await saveOfficialAvatar(id,file.originalname,file.buffer,file.mimetype);}catch(e){throw new BadRequestException(e instanceof Error?e.message:'图片无效');}}
    const updated=await this.prisma.officialSkill.updateMany({where:{id,updatedAt:row.updatedAt},data:{customAvatarPath:path}});
    if(updated.count!==1)throw new ConflictException('技能已更新，请重新打开后保存');
    if(actorId)await this.audit(actorId,file?'admin_upload_official_skill_icon':'admin_remove_official_skill_icon',{skillId:id});
    return this.adminDetail(id,{includeInstruction:true});
  }
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

  async validateZip(file?: { buffer: Buffer; originalname?: string }) {
    if (!file?.buffer?.length) throw skillPackageError('SKILL_PACKAGE_INVALID', '请选择技能包');
    const parsed = await parseSkillZip(file.buffer);
    const existing = await this.prisma.officialSkill.findUnique({
      where: { key: parsed.manifest.key },
      select: { id: true, enabledAt: true },
    });
    return {
      ...packagePreview(parsed),
      keyConflict: Boolean(existing),
      existingId: existing?.id ?? null,
    };
  }

  async createFromZip(
    actor: User,
    file: { buffer: Buffer; originalname?: string } | undefined,
    overrides: { name?: string; summary?: string; category?: string | null; categories?: unknown },
  ) {
    if (!file?.buffer?.length) throw skillPackageError('SKILL_PACKAGE_INVALID', '请选择技能包');
    const parsed = await parseSkillZip(file.buffer);
    if (parsed.keyDerived) {
      retargetPackageKey(parsed, await this.allocateKey(undefined, parsed.manifest.name));
    } else {
      await this.assertKeyAvailable(parsed.manifest.key);
    }
    const display = this.displayFromOverrides(parsed, overrides);
    this.applyCategories(parsed, this.resolveCategories(overrides));
    return this.persistNewSkill(actor, parsed, file.buffer, display);
  }

  async createFromForm(
    actor: User,
    body: {
      key?: string;
      name: string;
      summary?: string;
      category?: string | null;
      categories?: unknown;
      instruction?: string;
    },
  ) {
    const name = assertSkillDisplayName(body.name);
    const summary = assertSkillSummary(body.summary ?? '');
    const categories = this.resolveCategories(body) ?? [];
    const key = await this.allocateKey(body.key, name);
    const instruction = String(body.instruction ?? '');
    if (!instruction.trim()) {
      const created = await this.prisma.officialSkill.create({
        data: {
          key,
          name,
          summary,
          categories,
          enabledAt: null,
          currentRevision: 0,
          sourceName: name,
          sourceSummary: summary,
          displayProvenance: 'manual',
          displayLocale: 'zh-Hans',
          displaySourceHash: displaySourceHash(name, summary),
        },
      });
      await this.audit(actor.id, 'admin_create_official_skill', { skillId: created.id, key, revision: 0 });
      return this.adminDetail(created.id, { includeInstruction: true });
    }
    const parsed = buildSkillPackageFromForm({
      key,
      name,
      summary,
      categories,
      instruction,
    });
    return this.persistNewSkill(actor, parsed);
  }

  async updateMeta(
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
    const row = await this.requireSkill(id);
    assertFreshStamp(row.updatedAt.toISOString(), body.expectedUpdatedAt);
    const data: Prisma.OfficialSkillUpdateInput = {};
    if (body.name !== undefined) data.name = assertSkillDisplayName(body.name);
    if (body.summary !== undefined) data.summary = assertSkillSummary(body.summary);
    if (body.name !== undefined || body.summary !== undefined) {
      data.displayProvenance = 'manual';
      if (!row.sourceName) data.sourceName = row.name;
      if (!row.sourceSummary) data.sourceSummary = row.summary;
    }
    const categories = this.resolveCategories(body);
    if (categories !== undefined) {
      data.categories = categories;
    }

    const instructionProvided = body.instruction !== undefined;
    const instructionText = String(body.instruction ?? '');
    if (instructionProvided && !instructionText.trim() && row.currentPackageId) {
      throw new BadRequestException('技能指令不能为空');
    }
    let rebuilt: ParsedSkillPackage | null = null;
    if (instructionProvided && instructionText.trim()) {
      const name = body.name !== undefined ? assertSkillDisplayName(body.name) : row.name;
      const summary = body.summary !== undefined ? assertSkillSummary(body.summary) : row.summary;
      const nextCategories = categories ?? [...row.categories];
      rebuilt = buildSkillPackageFromForm({ key: row.key, name, summary, categories: nextCategories, instruction: instructionText });
    }
    await this.assertEnabledStillComplete(row, {
      name: body.name !== undefined ? String(data.name) : row.name,
      summary: body.summary !== undefined ? String(data.summary) : row.summary,
      instruction: instructionProvided ? instructionText : await this.readInstructionIfAny(row),
      hasPackage: Boolean(rebuilt || (row.currentPackageId && !(instructionProvided && !instructionText.trim()))),
    });

    if (!Object.keys(data).length && !rebuilt) {
      throw new BadRequestException('没有可保存的修改');
    }

    if (rebuilt) {
      const built = rebuilt;
      await this.mutateSkill(id, body.expectedUpdatedAt, async (tx, locked) => {
        await this.assertEnabledStillComplete(locked, {
          name: body.name !== undefined ? String(data.name ?? locked.name) : locked.name,
          summary: body.summary !== undefined ? String(data.summary ?? locked.summary) : locked.summary,
          instruction: built.instruction,
          hasPackage: true,
        });
        await this.replacePackage(tx, locked, built, undefined, data);
        await this.auditTx(tx, actor.id, 'admin_update_official_skill', {
          skillId: id,
          fields: [...Object.keys(data), 'instruction', 'package'],
        });
      });
      return this.adminDetail(id, { includeInstruction: true });
    } else {
      const updated = await this.prisma.officialSkill.updateMany({ where: { id, updatedAt: row.updatedAt }, data });
      if (updated.count !== 1) throw new ConflictException('技能已更新，请重新打开后保存');
      if (row.currentPackageId && (body.name !== undefined || body.summary !== undefined || categories !== undefined)) {
        await this.syncCurrentManifestMeta(id);
      }
    }

    await this.audit(actor.id, 'admin_update_official_skill', {
      skillId: id,
      fields: [...Object.keys(data), ...(rebuilt ? ['instruction', 'package'] : [])],
    });
    return this.adminDetail(id, { includeInstruction: true });
  }

  async replaceZip(
    actor: User,
    id: string,
    file: { buffer: Buffer; originalname?: string } | undefined,
    overrides: { name?: string; summary?: string; category?: string | null; categories?: unknown; expectedUpdatedAt?: string },
  ) {
    if (!file?.buffer?.length) throw skillPackageError('SKILL_PACKAGE_INVALID', '请选择技能包');
    const parsed = await parseSkillZip(file.buffer);
    await this.mutateSkill(id, overrides.expectedUpdatedAt, async (tx, row) => {
      const decision = zipReplaceDecision(row.key, { key: parsed.manifest.key, keyDerived: parsed.keyDerived });
      if (!decision.ok) throw skillPackageError('SKILL_PACKAGE_INVALID', decision.message);
      if (parsed.manifest.key !== decision.key) retargetPackageKey(parsed, decision.key);
      const display = this.displayFromOverrides(parsed, overrides, row);
      this.applyCategories(parsed, this.resolveCategories(overrides));
      await this.assertEnabledStillComplete(row, {
        name: display.name,
        summary: display.summary,
        instruction: parsed.instruction,
        hasPackage: true,
      });
      await this.replacePackage(tx, row, parsed, file.buffer, {
        name: display.name,
        summary: display.summary,
        categories: storedCategories(parsed.manifest),
        displayProvenance: display.provenance,
      });
      await this.auditTx(tx, actor.id, 'admin_replace_official_skill_package', {
        skillId: id,
        key: row.key,
        revision: row.currentRevision + 1,
      });
    });
    return this.adminDetail(id, { includeInstruction: true });
  }

  async enable(actor: User, id: string) {
    await this.mutateSkill(id, undefined, async (tx, row) => {
      if (row.enabledAt) return;
      const instruction = await this.readInstructionIfAny(row);
      const gaps = skillEnableGaps({
        name: row.name,
        summary: row.summary,
        instruction,
        hasPackage: Boolean(row.currentPackageId && row.currentRevision >= 1 && row.currentPackage),
      });
      if (gaps.length) {
        throw new BadRequestException({
          code: 'SKILL_ENABLE_INCOMPLETE',
          message: skillEnableMessage(gaps),
          missing: gaps,
        });
      }
      await tx.officialSkill.update({ where: { id }, data: { enabledAt: new Date() } });
      await this.auditTx(tx, actor.id, 'admin_enable_official_skill', { skillId: id, key: row.key });
    });
    return this.presentAdmin(await this.requireSkill(id));
  }

  async disable(actor: User, id: string) {
    const row = await this.requireSkill(id);
    if (!row.enabledAt) return this.presentAdmin(row);
    await this.prisma.officialSkill.update({
      where: { id },
      data: { enabledAt: null },
    });
    await this.audit(actor.id, 'admin_disable_official_skill', {
      skillId: id,
      key: row.key,
      linkedAgentCount: row.agentLinks.length,
    });
    return this.presentAdmin(await this.requireSkill(id));
  }

  async remove(actor: User, id: string) {
    const row = await this.prisma.officialSkill.findUnique({ where: { id }, include: skillInclude });
    if (!row || row.deletedAt) throw new NotFoundException('官方技能不存在');
    const plan = planSkillDelete({ enabled: Boolean(row.enabledAt), linkedAgentCount: row.agentLinks.length });
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM official_skill WHERE id = ${id} FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundException('官方技能不存在');
      const fresh = await tx.officialSkill.findUnique({ where: { id }, select: { deletedAt: true } });
      if (!fresh || fresh.deletedAt) throw new NotFoundException('官方技能不存在');
      await tx.officialSkill.update({ where: { id }, data: skillDeletePatch(new Date()) });
      if (plan.hideFromNewUse) {
        await tx.officialCatalogPreference.deleteMany({ where: { kind: 'skill', resourceId: id } });
      }
      await this.auditTx(tx, actor.id, 'admin_delete_official_skill', {
        skillId: id,
        key: row.key,
        name: row.name,
        enabled: Boolean(row.enabledAt),
        linkedAgentCount: row.agentLinks.length,
        retained: [
          ...(plan.retainPackages ? ['packages' as const] : []),
          ...(plan.retainAgentLinks ? ['agentLinks' as const] : []),
          ...(plan.retainUserHistory ? ['userHistory' as const] : []),
        ],
      });
    });
    return { ok: true as const, id: row.id, key: row.key, name: row.name };
  }

  /** Public enabled directory for both clients. */
  async publicList(query: { q?: string; category?: string; taxonomy?: 'industry' | 'facets' }) {
    const q = query.q?.trim();
    const category =
      query.category && isOfficialSkillCategory(query.category) ? query.category : undefined;
    const rows = await this.prisma.officialSkill.findMany({
      where: {
        deletedAt: null,
        enabledAt: { not: null },
        currentRevision: { gt: 0 },
        ...(category ? { categories: { has: category } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { summary: { contains: q, mode: 'insensitive' } },
                ...(isOfficialSkillCategory(q) ? [{ categories: { has: q as OfficialSkillCategoryKey } }] : []),
              ],
            }
          : {}),
      },
      select: {
        id: true,
        key: true,
        name: true,
        summary: true,
        categories: true,
        enabledAt: true,
        currentRevision: true,
      },
      orderBy: [{ name: 'asc' }],
    });
    return rows.map((row) => {
      const card = this.publicCard(row, query.taxonomy === 'industry' || query.taxonomy === 'facets');
      const discovery = query.taxonomy === 'facets' ? skillDiscovery(row.key) : undefined;
      return discovery ? { ...card, discovery } : card;
    });
  }

  async publicContent(id: string, revision?: number, packageFormat?: number) {
    const row = await this.prisma.officialSkill.findUnique({
      where: { id },
      include: { currentPackage: true, packages: true },
    });
    if (!row) {
      throw skillPackageError('OFFICIAL_CONTENT_DISABLED', '该技能暂不可用', 403);
    }
    const decision = skillReadDecision({
      deleted: Boolean(row.deletedAt),
      enabled: Boolean(row.enabledAt),
      pinnedRevision: revision,
    });
    if (!decision.ok) throw skillPackageError(decision.code, decision.message, 403);
    const targetRevision = revision ?? row.currentRevision;
    const pkg =
      row.packages.find((item) => item.revision === targetRevision) ??
      (row.currentPackage?.revision === targetRevision ? row.currentPackage : null);
    if (!pkg) {
      throw skillPackageError('SKILL_REVISION_UNAVAILABLE', '技能包版本不可用', 404);
    }
    const instruction = await this.readInstructionFromPath(pkg.storagePath);
    const manifest = pkg.manifest as {
      references?: Array<{ path: string }>;
      name?: string;
      description?: string;
      key?: string;
    };
    const complete = completeSkillManifest(pkg.manifest);
    if (complete) {
      if (packageFormat !== 2) throw skillPackageError('SKILL_CLIENT_UPGRADE_REQUIRED', '此技能包含完整包内容，请更新客户端后使用', 409);
      return {
        id: row.id, key: row.key, name: row.name, summary: row.summary,
        packageRevision: pkg.revision, instruction, ...complete,
      };
    }
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      summary: row.summary,
      packageRevision: pkg.revision,
      instruction,
      references: Array.isArray(manifest.references) ? manifest.references : [],
    };
  }

  async publicResource(id: string, resourcePath: string, revision?: number) {
    const row = await this.prisma.officialSkill.findUnique({
      where: { id },
      include: { packages: true, currentPackage: true },
    });
    if (!row) {
      throw skillPackageError('OFFICIAL_CONTENT_DISABLED', '该技能暂不可用', 403);
    }
    const decision = skillReadDecision({
      deleted: Boolean(row.deletedAt),
      enabled: Boolean(row.enabledAt),
      pinnedRevision: revision,
    });
    if (!decision.ok) throw skillPackageError(decision.code, decision.message, 403);
    const safe = String(resourcePath || '');
    if (!isSkillPackagePath(safe)) throw skillPackageError('SKILL_RESOURCE_NOT_FOUND', '资源不存在', 404);
    const targetRevision = revision ?? row.currentRevision;
    const pkg = row.packages.find((item) => item.revision === targetRevision);
    if (!pkg) {
      throw skillPackageError('SKILL_REVISION_UNAVAILABLE', '技能包版本不可用', 404);
    }
    const manifest = pkg.manifest as { references?: Array<{ path: string }> };
    const complete = completeSkillManifest(pkg.manifest);
    const allowed = new Set(complete ? complete.files.map(file => file.path) :
      (Array.isArray(manifest.references) ? manifest.references.map(item => item.path).filter(path => path.startsWith('references/')) : []));
    if (!allowed.has(safe)) {
      throw skillPackageError('SKILL_RESOURCE_NOT_FOUND', '资源不存在', 404);
    }
    const abs = join(absoluteUploadPath(pkg.storagePath), ...safe.split('/'));
    if (!abs.startsWith(absoluteUploadPath(pkg.storagePath)) || !existsSync(abs)) {
      throw skillPackageError('SKILL_RESOURCE_NOT_FOUND', '资源不存在', 404);
    }
    return {
      abs,
      path: safe,
      stream: createReadStream(abs),
    };
  }

  /**
   * Ground contract for Host to start a skill-sourced session.
   * Does not create Host sessions; returns frozen binding payload only.
   */
  async beginSession(user: User, id: string, expectedRevision?: number) {
    this.requireActiveAccount(user);
    const row = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM official_skill WHERE id = ${id} FOR UPDATE
      `;
      if (!locked.length) throw skillPackageError('OFFICIAL_CONTENT_DISABLED', '该技能暂不可用', 403);
      const fresh = await tx.officialSkill.findUnique({ where: { id } });
      if (!fresh) throw skillPackageError('OFFICIAL_CONTENT_DISABLED', '该技能暂不可用', 403);
      const decision = skillStartDecision({
        deleted: Boolean(fresh.deletedAt),
        enabled: Boolean(fresh.enabledAt),
        revision: fresh.currentRevision,
      });
      if (!decision.ok) throw skillPackageError(decision.code, decision.message, 403);
      if (expectedRevision != null && expectedRevision !== fresh.currentRevision) {
        throw skillPackageError('SKILL_REVISION_UNAVAILABLE', '技能包版本已更新，请刷新后重试', 409);
      }
      return fresh;
    });
    return {
      sessionSource: {
        type: 'skill' as const,
        id: row.id,
        key: row.key,
        name: row.name,
        packageRevision: row.currentRevision,
        ...(uploadedCatalogIconUrl(row.customAvatarPath)
          ? { avatarUrl: uploadedCatalogIconUrl(row.customAvatarPath) }
          : {}),
      },
      skill: this.publicCard(row),
      /** Host should keep standard mode capabilities; Ground does not expand tool registry here. */
      standardCapabilities: {
        files: true,
        terminal: true,
        network: true,
      },
      loadPolicy: {
        initialContext: 'summary_only',
        instructionOnDemand: true,
        contentPath: `/api/official-skills/${row.id}/content?revision=${row.currentRevision}`,
      },
    };
  }

  async summarizeEnabledSkills(skillIds: string[], tx?: Prisma.TransactionClient): Promise<SkillSummary[]> {
    if (!skillIds.length) return [];
    const rows = await (tx ?? this.prisma).officialSkill.findMany({
      where: {
        id: { in: skillIds },
        deletedAt: null,
        enabledAt: { not: null },
        currentRevision: { gt: 0 },
      },
      select: {
        id: true,
        key: true,
        name: true,
        summary: true,
        categories: true,
        currentRevision: true,
        enabledAt: true,
      },
    });
    const order = new Map(skillIds.map((id, index) => [id, index]));
    return rows
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((row) => ({
        id: row.id,
        key: row.key,
        name: row.name,
        summary: row.summary,
        category: legacySkillCategory(primarySkillCategory(row.categories)),
        packageRevision: row.currentRevision,
        enabledAt: row.enabledAt?.toISOString() ?? null,
      }));
  }

  async setAgentSkillLinks(agentId: string, skillIds: string[], tx?: Prisma.TransactionClient) {
    const unique = [...new Set(skillIds.map((id) => id.trim()).filter(Boolean))];
    if (unique.length) {
      const enabled = await (tx ?? this.prisma).officialSkill.findMany({
        where: { id: { in: unique }, OR: [{ enabledAt: { not: null } }, { agentLinks: { some: { agentId } } }] },
        select: { id: true },
      });
      if (enabled.length !== unique.length) {
        throw new BadRequestException('只能关联当前已启用的技能');
      }
    }
    const write = async (client: Prisma.TransactionClient) => {
      await client.officialAgentSkillLink.deleteMany({ where: { agentId } });
      if (unique.length) {
        await client.officialAgentSkillLink.createMany({
          data: unique.map((skillId) => ({ agentId, skillId })),
        });
      }
    };
    if (tx) await write(tx); else await this.prisma.$transaction(write);
    return this.summarizeEnabledSkills(unique, tx);
  }

  async listAgentLinkedSkillIds(agentId: string, tx?: Prisma.TransactionClient) {
    const rows = await (tx ?? this.prisma).officialAgentSkillLink.findMany({
      where: { agentId },
      select: { skillId: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => row.skillId);
  }

  async snapshotLinkedSkills(agentId: string, tx?: Prisma.TransactionClient): Promise<SkillSummary[]> {
    const ids = await this.listAgentLinkedSkillIds(agentId, tx);
    return this.summarizeEnabledSkills(ids, tx);
  }

  private async persistNewSkill(
    actor: User,
    parsed: ParsedSkillPackage,
    sourceZip?: Buffer,
    display?: { name: string; summary: string; provenance: 'manual' | 'source' },
  ) {
    const name = display?.name ?? parsed.manifest.name;
    const summary = display?.summary ?? parsed.manifest.description;
    // Create skill row first to get id for storage path; then package + point current.
    const createdId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.officialSkill.create({
        data: {
          key: parsed.manifest.key,
          name,
          summary,
          categories: storedCategories(parsed.manifest),
          enabledAt: null,
          currentRevision: 0,
          sourceName: parsed.manifest.name,
          sourceSummary: parsed.manifest.description,
          displayProvenance: display?.provenance ?? 'source',
          displayLocale: 'zh-Hans',
          displaySourceHash: displaySourceHash(parsed.manifest.name, parsed.manifest.description),
        },
      });
      const revision = 1;
      const rel = officialSkillPackageRelDir(created.id, revision);
      try {
        const written = await writeSkillPackageToDisk(created.id, revision, parsed, sourceZip);
        const pkg = await tx.officialSkillPackage.create({
          data: {
            skillId: created.id,
            revision,
            storagePath: written.storagePath,
            manifest: parsed.manifest as unknown as Prisma.InputJsonValue,
            instructionBytes: Buffer.byteLength(parsed.instruction, 'utf8'),
            resourceCount: parsed.resourceCount,
            sourceZipPath: written.sourceZipPath,
          },
        });
        await tx.officialSkill.update({
          where: { id: created.id },
          data: { currentRevision: revision, currentPackageId: pkg.id },
        });
        await this.auditTx(tx, actor.id, 'admin_create_official_skill', {
          skillId: created.id,
          key: created.key,
          revision: 1,
        });
        return created.id;
      } catch (error) {
        await rm(absoluteUploadPath(rel), { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    }, { timeout: 20000 });
    return this.adminDetail(createdId, { includeInstruction: true });
  }

  private async replacePackage(
    tx: Prisma.TransactionClient,
    row: SkillRow,
    parsed: ParsedSkillPackage,
    sourceZip: Buffer | undefined,
    extra: Prisma.OfficialSkillUpdateInput = {},
  ) {
    const { revision } = packageWriteClaim(
      { updatedAt: row.updatedAt.toISOString(), revision: row.currentRevision },
      row.updatedAt.toISOString(),
    );
    const rel = officialSkillPackageRelDir(row.id, revision);
    const sourceName = row.sourceName?.trim() || parsed.manifest.name;
    const sourceSummary = row.sourceSummary?.trim() || parsed.manifest.description;
    try {
      const written = await writeSkillPackageToDisk(row.id, revision, parsed, sourceZip);
      const pkg = await tx.officialSkillPackage.create({
        data: {
          skillId: row.id,
          revision,
          storagePath: written.storagePath,
          manifest: parsed.manifest as unknown as Prisma.InputJsonValue,
          instructionBytes: Buffer.byteLength(parsed.instruction, 'utf8'),
          resourceCount: parsed.resourceCount,
          sourceZipPath: written.sourceZipPath,
        },
      });
      await tx.officialSkill.update({
        where: { id: row.id },
        data: {
          currentRevision: revision,
          currentPackageId: pkg.id,
          categories: storedCategories(parsed.manifest),
          ...(!row.sourceName?.trim() ? { sourceName: parsed.manifest.name } : {}),
          ...(!row.sourceSummary?.trim() ? { sourceSummary: parsed.manifest.description } : {}),
          displaySourceHash: displaySourceHash(sourceName, sourceSummary),
          ...extra,
        } as Prisma.OfficialSkillUncheckedUpdateInput,
      });
    } catch (error) {
      await rm(absoluteUploadPath(rel), { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  /** Lock the skill row, then run the write. The stamp is checked on the locked row, not on an earlier read. */
  private async mutateSkill<T>(
    id: string,
    expectedUpdatedAt: string | undefined,
    run: (tx: Prisma.TransactionClient, row: SkillRow) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM official_skill WHERE id = ${id} FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundException('官方技能不存在');
      const row = await tx.officialSkill.findUnique({ where: { id }, include: skillInclude });
      if (!row || row.deletedAt) throw new NotFoundException('官方技能不存在');
      assertFreshStamp(row.updatedAt.toISOString(), expectedUpdatedAt);
      return run(tx, row);
    }, { timeout: 20000 });
  }

  private async auditTx(tx: Prisma.TransactionClient, actorUserId: string, action: string, meta: Prisma.InputJsonObject) {
    await tx.auditLog.create({ data: { userId: actorUserId, action, tenantId: null, meta } });
  }

  private async syncCurrentManifestMeta(skillId: string) {
    const row = await this.requireSkill(skillId);
    if (!row.currentPackage) return;
    const prev = (row.currentPackage.manifest ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = {
      ...prev,
      key: row.key,
      name: row.sourceName?.trim() || row.name,
      description: (row.sourceSummary || row.summary || '').trim(),
      entry: 'SKILL.md',
    };
    if (row.categories.length) next.category = row.categories[0];
    else delete next.category;
    if (row.categories.length > 1) next.categories = row.categories;
    else delete next.categories;
    await this.prisma.officialSkillPackage.update({
      where: { id: row.currentPackage.id },
      data: { manifest: next as Prisma.InputJsonValue },
    });
    // Complete package files retain their uploaded bytes; display metadata is database-owned.
    if (prev.packageFormat === 2) return;
    // Legacy packages have a platform-generated skill.json.
    try {
      const abs = join(absoluteUploadPath(row.currentPackage.storagePath), 'skill.json');
      const { writeFile } = await import('fs/promises');
      await writeFile(abs, JSON.stringify(next, null, 2), 'utf8');
    } catch {
      /* ignore disk sync failure; DB is authority for meta */
    }
  }

  private displayFromOverrides(
    parsed: ParsedSkillPackage,
    overrides: { name?: string; summary?: string },
    row?: { name: string; summary: string },
  ) {
    const name =
      overrides.name !== undefined && String(overrides.name).trim()
        ? assertSkillDisplayName(overrides.name)
        : (row?.name ?? parsed.manifest.name);
    const summary =
      overrides.summary !== undefined
        ? assertSkillSummary(overrides.summary)
        : (row?.summary ?? parsed.manifest.description);
    const provenance: 'manual' | 'source' =
      name !== parsed.manifest.name || summary !== parsed.manifest.description ? 'manual' : 'source';
    return { name, summary, provenance };
  }

  private applyCategories(parsed: ParsedSkillPackage, categories: OfficialSkillCategoryKey[] | undefined) {
    if (categories === undefined) return;
    assignManifestCategories(parsed.manifest, categories);
    retargetPackageKey(parsed, parsed.manifest.key);
  }

  private resolveCategories(body: { categories?: unknown; category?: string | null }): OfficialSkillCategoryKey[] | undefined {
    if (body.categories !== undefined) return parseSkillCategories(body.categories);
    if (body.category !== undefined) return parseSkillCategories(body.category === '' ? [] : body.category);
    return undefined;
  }

  private async allocateKey(requested: string | undefined, name: string) {
    const explicit = String(requested ?? '').trim();
    if (explicit) {
      const key = assertSkillKey(explicit);
      await this.assertKeyAvailable(key);
      return key;
    }
    const entropy = Array.from({ length: 6 }, () => randomBytes(3).toString('hex'));
    for (const key of candidateSkillKeys(name, entropy)) {
      const existing = await this.prisma.officialSkill.findUnique({ where: { key }, select: { id: true } });
      if (!existing) return key;
    }
    throw new ConflictException('暂时无法生成唯一标识，请重试');
  }

  private async readInstructionIfAny(row: SkillRow) {
    if (!row.currentPackage) return '';
    try {
      return await this.readInstructionFromPath(row.currentPackage.storagePath);
    } catch {
      return '';
    }
  }

  private async assertEnabledStillComplete(
    row: SkillRow,
    next: { name: string; summary: string; instruction: string; hasPackage: boolean },
  ) {
    if (!row.enabledAt) return;
    const gaps = skillEnableGaps(next);
    if (gaps.length) throw new BadRequestException(skillEnableMessage(gaps, 'save'));
  }

  private async assertKeyAvailable(key: string) {
    assertSkillKey(key);
    const existing = await this.prisma.officialSkill.findUnique({ where: { key } });
    if (existing) {
      throw new ConflictException('技能标识已存在，同标识请走编辑入口替换内容');
    }
  }

  private async assertPackageReady(row: SkillRow) {
    if (!row.currentPackageId || row.currentRevision < 1 || !row.currentPackage) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包尚未就绪，无法启用');
    }
    const skillMd = join(absoluteUploadPath(row.currentPackage.storagePath), 'SKILL.md');
    if (!existsSync(skillMd)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包资源不完整，无法启用');
    }
  }

  private async requireSkill(id: string) {
    const row = await this.prisma.officialSkill.findUnique({
      where: { id },
      include: skillInclude,
    });
    if (!row || row.deletedAt) throw new NotFoundException('官方技能不存在');
    return row;
  }

  private presentAdmin(row: SkillRow) {
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

  private publicCard(row: {
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

  private async readInstruction(row: SkillRow) {
    if (!row.currentPackage) return '';
    return this.readInstructionFromPath(row.currentPackage.storagePath);
  }

  private async readInstructionFromPath(storagePath: string) {
    const abs = join(absoluteUploadPath(storagePath), 'SKILL.md');
    if (!existsSync(abs)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能说明缺失');
    }
    return readFile(abs, 'utf8');
  }

  private requireActiveAccount(user: User) {
    if (user.status !== 'active') throw new ForbiddenException('当前账号已停用');
  }

  private async audit(actorUserId: string, action: string, meta: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({
      data: { userId: actorUserId, action, tenantId: null, meta },
    });
  }

  /**
   * Machine-fill zh display name/summary via Ground cloud model pool (preferred/auto).
   * Never rewrites SKILL.md / instruction / tool ids. Skips displayProvenance=manual.
   */
  async translateDisplayBatch(
    actor: User,
    opts: { dryRun?: boolean; limit?: number; keys?: string[]; maxAttempts?: number } = {},
  ) {
    if (!actor.isPlatformAdmin) throw new ForbiddenException('仅平台管理员可批量翻译技能展示文案');
    const limit = Math.max(1, Math.min(opts.limit ?? 20, 100));
    const maxAttempts = Math.max(1, Math.min(opts.maxAttempts ?? 3, 5));
    const rows = await this.prisma.officialSkill.findMany({
      where: opts.keys?.length ? { key: { in: opts.keys } } : undefined,
      orderBy: { key: 'asc' },
      select: {
        id: true,
        key: true,
        name: true,
        summary: true,
        sourceName: true,
        sourceSummary: true,
        displayProvenance: true,
        displaySourceHash: true,
      },
    });
    const candidates = rows.filter((row) =>
      needsMachineDisplayTranslation({
        name: row.name,
        summary: row.summary,
        sourceName: row.sourceName,
        sourceSummary: row.sourceSummary,
        displayProvenance: row.displayProvenance,
        displaySourceHash: row.displaySourceHash,
      }),
    );
    const skippedManual = rows.filter((r) => r.displayProvenance === 'manual').length;
    const selected = candidates.slice(0, limit);
    const report = {
      dryRun: Boolean(opts.dryRun),
      total: rows.length,
      needingTranslation: candidates.length,
      selected: selected.length,
      skippedManual,
      translated: 0,
      failed: 0,
      skipped: 0,
      failures: [] as Array<{ key: string; error: string }>,
      translatedKeys: [] as string[],
      modelRef: null as string | null,
    };
    if (opts.dryRun) return report;

    for (const row of selected) {
      const sourceName = (row.sourceName ?? row.name).trim();
      const sourceSummary = (row.sourceSummary || row.summary || '').trim();
      // Ensure originals are pinned before mutating display fields.
      if (!row.sourceName || row.sourceSummary === '') {
        await this.prisma.officialSkill.update({
          where: { id: row.id },
          data: {
            sourceName: row.sourceName ?? row.name,
            sourceSummary: row.sourceSummary || row.summary || '',
          },
        });
      }
      let lastError = 'unknown';
      let ok = false;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const completion = await this.llm.completeOnce(actor, null, {
            model: 'auto',
            temperature: 0.2,
            messages: [
              { role: 'system', content: '只输出 JSON 对象，不要解释。' },
              {
                role: 'user',
                content: buildDisplayTranslationPrompt({
                  key: row.key,
                  sourceName,
                  sourceSummary,
                }),
              },
            ],
          });
          report.modelRef = completion.modelRef;
          const parsed = parseDisplayTranslationJson(completion.content);
          const name = assertSkillDisplayName(parsed.name);
          const summary = assertSkillSummary(parsed.summary);
          const hash = displaySourceHash(sourceName, sourceSummary);
          await this.prisma.officialSkill.update({
            where: { id: row.id },
            data: {
              name,
              summary,
              sourceName,
              sourceSummary,
              displayProvenance: 'machine',
              displayLocale: 'zh-Hans',
              displayTranslatedAt: new Date(),
              displayModelRef: completion.modelRef,
              displaySourceHash: hash,
            },
          });
          // Do not rewrite package SKILL.md; manifest keeps source via sync helper when needed.
          report.translated += 1;
          report.translatedKeys.push(row.key);
          ok = true;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
      if (!ok) {
        report.failed += 1;
        report.failures.push({ key: row.key, error: lastError.slice(0, 300) });
      }
    }
    await this.audit(actor.id, 'admin_translate_official_skill_display', {
      translated: report.translated,
      failed: report.failed,
      selected: report.selected,
      modelRef: report.modelRef,
    });
    return report;
  }

}
