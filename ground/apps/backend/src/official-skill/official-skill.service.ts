import { normalizeDiscoveryDetail, publicDiscoveryDetail } from '../official-agent/discovery-detail';
import { catalogQuery, catalogFacets, catalogDiscoveryWhere, discoveryOf, displaySummary, DESCRIPTIONS, nextCatalogCursor, type CatalogQuery } from '../official-agent/catalog-discovery';
import { uploadedCatalogIconUrl } from '../official-agent/gallery-avatars';
import { saveOfficialAvatar } from '../knowledge/storage';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { createReadStream, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { absoluteUploadPath } from '../knowledge/storage';
import { skillDiscovery } from './skill-discovery';
import {
  ParsedSkillPackage,
  assertSkillDisplayName,
  assertSkillKey,
  assertSkillSummary,
  buildSkillPackageFromForm,
  isOfficialSkillCategory,
  legacySkillCategory,
  packagePreview,
  parseSkillZip,
  skillPackageError,
  writeSkillPackageToDisk,
  type OfficialSkillCategoryKey,
} from './skill-package';

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
  constructor(private prisma: PrismaService) {}

  async setIcon(id:string,file?:{originalname:string;mimetype:string;buffer:Buffer},actorId?:string) {
    await this.requireSkill(id);let path:string|null=null;
    if(file){try{path=await saveOfficialAvatar(id,file.originalname,file.buffer,file.mimetype);}catch(e){throw new BadRequestException(e instanceof Error?e.message:'图片无效');}}
    await this.prisma.officialSkill.update({where:{id},data:{customAvatarPath:path}});
    if(actorId)await this.audit(actorId,file?'admin_upload_official_skill_icon':'admin_remove_official_skill_icon',{skillId:id});
    return this.adminDetail(id,{includeInstruction:true});
  }
  async catalogFacets(){const rows=await this.prisma.officialSkill.findMany({where:{enabledAt:{not:null},currentRevision:{gt:0}},select:{key:true}});return catalogFacets('skill',rows.map(x=>x.key));}
  async catalogPage(query:CatalogQuery){
    const f=catalogQuery(query,'skill');const filters:Prisma.OfficialSkillWhereInput[]=[{enabledAt:{not:null},currentRevision:{gt:0}}];
    if(f.capability!=='all'||f.industry!=='all')filters.push(catalogDiscoveryWhere('skill',f.capability,f.industry));
    if(f.q)filters.push({OR:[...['name','summary','key'].map(field=>({[field]:{contains:f.q,mode:'insensitive' as const}})),...Object.entries(DESCRIPTIONS).filter(([,v])=>v.summary.toLocaleLowerCase().includes(f.q.toLocaleLowerCase())).map(([key,v])=>({key,summary:v.expectedOriginal}))]});
    const where:Prisma.OfficialSkillWhereInput={AND:filters};
    const [total,rows]=await this.prisma.$transaction([this.prisma.officialSkill.count({where}),this.prisma.officialSkill.findMany({where:{AND:[where,...f.after?[{key:{gt:f.after}}]:[]]},orderBy:{key:'asc'},take:21,select:{id:true,key:true,name:true,summary:true,category:true,enabledAt:true,currentRevision:true,customAvatarPath:true}})],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    const page=rows.slice(0,20);return {items:page.map(row=>({id:row.id,key:row.key,name:row.name,summary:displaySummary(row.key,row.summary),category:row.category,enabledAt:row.enabledAt?.toISOString()??null,packageRevision:row.currentRevision,avatarUrl:uploadedCatalogIconUrl(row.customAvatarPath),discovery:discoveryOf('skill',row.key)})),total,hasMore:rows.length>20,nextCursor:rows.length>20?nextCatalogCursor(page[page.length-1]!.key,f.signature):null};
  }

  async discovery(id:string){const row=await this.requireSkill(id);return {id:row.id,name:row.name,updatedAt:row.updatedAt.toISOString(),discoveryDetail:publicDiscoveryDetail(row.discoveryDetail)};}

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
  async catalogDetail(user:User,id:string){
    this.requireActiveAccount(user);
    const row=await this.prisma.officialSkill.findFirst({where:{id,enabledAt:{not:null},currentRevision:{gt:0}},select:{id:true,key:true,name:true,summary:true,category:true,enabledAt:true,currentRevision:true,customAvatarPath:true,discoveryDetail:true}});
    if(!row)throw new NotFoundException('技能不可用');
    return {kind:'skill' as const,id:row.id,key:row.key,name:row.name,summary:displaySummary(row.key,row.summary),avatarUrl:uploadedCatalogIconUrl(row.customAvatarPath),packageRevision:row.currentRevision,discovery:discoveryOf('skill',row.key),detail:publicDiscoveryDetail(row.discoveryDetail),linkedSkills:[]};
  }

  async adminList(query: { keyword?: string; enabled?: 'true' | 'false' | '' }) {
    const keyword = query.keyword?.trim();
    const enabled =
      query.enabled === 'true' ? true : query.enabled === 'false' ? false : undefined;
    const rows = await this.prisma.officialSkill.findMany({
      where: {
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
      where: { enabledAt: { not: null }, currentRevision: { gt: 0 } },
      select: {
        id: true,
        key: true,
        name: true,
        summary: true,
        category: true,
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
      category: row.category,
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
    overrides: { name?: string; summary?: string; category?: string | null },
  ) {
    if (!file?.buffer?.length) throw skillPackageError('SKILL_PACKAGE_INVALID', '请选择技能包');
    const parsed = await parseSkillZip(file.buffer);
    await this.assertKeyAvailable(parsed.manifest.key);
    this.applyOverrides(parsed, overrides);
    return this.persistNewSkill(actor, parsed, file.buffer);
  }

  async createFromForm(
    actor: User,
    body: {
      key: string;
      name: string;
      summary: string;
      category?: string | null;
      instruction: string;
    },
  ) {
    const parsed = buildSkillPackageFromForm({
      key: body.key,
      name: body.name,
      summary: body.summary,
      category: body.category && isOfficialSkillCategory(body.category) ? body.category : null,
      instruction: body.instruction,
    });
    await this.assertKeyAvailable(parsed.manifest.key);
    return this.persistNewSkill(actor, parsed);
  }

  async updateMeta(
    actor: User,
    id: string,
    body: {
      name?: string;
      summary?: string;
      category?: string | null;
      instruction?: string;
      linkedOnly?: boolean;
    },
  ) {
    const row = await this.requireSkill(id);
    const data: Prisma.OfficialSkillUpdateInput = {};
    if (body.name !== undefined) data.name = assertSkillDisplayName(body.name);
    if (body.summary !== undefined) data.summary = assertSkillSummary(body.summary);
    if (body.category !== undefined) {
      if (body.category === null || body.category === '') data.category = null;
      else if (!isOfficialSkillCategory(body.category)) {
        throw new BadRequestException('分类不在允许范围内');
      } else data.category = body.category;
    }

    let rebuilt: ParsedSkillPackage | null = null;
    if (body.instruction !== undefined) {
      const name = body.name !== undefined ? assertSkillDisplayName(body.name) : row.name;
      const summary = body.summary !== undefined ? assertSkillSummary(body.summary) : row.summary;
      const category =
        body.category !== undefined
          ? body.category && isOfficialSkillCategory(body.category)
            ? body.category
            : null
          : row.category;
      rebuilt = buildSkillPackageFromForm({
        key: row.key,
        name,
        summary,
        category,
        instruction: body.instruction,
      });
    }

    if (!Object.keys(data).length && !rebuilt) {
      throw new BadRequestException('没有可保存的修改');
    }

    if (rebuilt) {
      await this.replacePackage(actor, row, rebuilt);
      if (Object.keys(data).length) {
        await this.prisma.officialSkill.update({ where: { id }, data });
      }
    } else {
      await this.prisma.officialSkill.update({ where: { id }, data });
      // Keep manifest display fields in sync when only meta changes (no instruction rebuild).
      if (row.currentPackageId && (body.name !== undefined || body.summary !== undefined || body.category !== undefined)) {
        await this.syncCurrentManifestMeta(id);
      }
    }

    await this.audit(actor.id, 'admin_update_official_skill', {
      skillId: id,
      fields: [
        ...Object.keys(data),
        ...(rebuilt ? ['instruction', 'package'] : []),
      ],
    });
    return this.adminDetail(id, { includeInstruction: true });
  }

  async replaceZip(
    actor: User,
    id: string,
    file: { buffer: Buffer; originalname?: string } | undefined,
    overrides: { name?: string; summary?: string; category?: string | null },
  ) {
    if (!file?.buffer?.length) throw skillPackageError('SKILL_PACKAGE_INVALID', '请选择技能包');
    const row = await this.requireSkill(id);
    const parsed = await parseSkillZip(file.buffer);
    if (parsed.manifest.key !== row.key) {
      throw skillPackageError(
        'SKILL_PACKAGE_INVALID',
        '技能包标识与当前技能不一致，请使用编辑入口替换同标识内容',
      );
    }
    this.applyOverrides(parsed, overrides);
    await this.replacePackage(actor, row, parsed, file.buffer);
    await this.audit(actor.id, 'admin_replace_official_skill_package', {
      skillId: id,
      key: row.key,
      revision: row.currentRevision + 1,
    });
    return this.adminDetail(id, { includeInstruction: true });
  }

  async enable(actor: User, id: string) {
    const row = await this.requireSkill(id);
    await this.assertPackageReady(row);
    if (row.enabledAt) return this.presentAdmin(await this.requireSkill(id));
    await this.prisma.officialSkill.update({
      where: { id },
      data: { enabledAt: new Date() },
    });
    await this.audit(actor.id, 'admin_enable_official_skill', { skillId: id, key: row.key });
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
    const row = await this.requireSkill(id);
    if (row.agentLinks.length) {
      throw new ConflictException('技能仍被专家关联，只能停用，不能删除');
    }
    if (row.enabledAt) {
      throw new ConflictException('已启用过的技能请先停用；被引用内容仅可停用');
    }
    await this.prisma.officialSkill.delete({ where: { id } });
    await this.audit(actor.id, 'admin_delete_official_skill', { skillId: id, key: row.key });
    return { ok: true };
  }

  /** Public enabled directory for both clients. */
  async publicList(query: { q?: string; category?: string; taxonomy?: 'industry' | 'facets' }) {
    const q = query.q?.trim();
    const category =
      query.category && isOfficialSkillCategory(query.category) ? query.category : undefined;
    const rows = await this.prisma.officialSkill.findMany({
      where: {
        enabledAt: { not: null },
        currentRevision: { gt: 0 },
        ...(category ? { category } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { summary: { contains: q, mode: 'insensitive' } },
                ...(isOfficialSkillCategory(q) ? [{ category: q as OfficialSkillCategoryKey }] : []),
              ],
            }
          : {}),
      },
      select: {
        id: true,
        key: true,
        name: true,
        summary: true,
        category: true,
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

  async publicContent(id: string, revision?: number) {
    const row = await this.prisma.officialSkill.findUnique({
      where: { id },
      include: { currentPackage: true, packages: true },
    });
    if (!row) {
      throw skillPackageError('OFFICIAL_CONTENT_DISABLED', '该技能暂不可用', 403);
    }
    // Directory/new sessions still require enabled; frozen Host sessions may pin a revision after disable.
    if (!row.enabledAt && revision === undefined) {
      throw skillPackageError('OFFICIAL_CONTENT_DISABLED', '该技能暂不可用', 403);
    }
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
    if (!row.enabledAt && revision === undefined) {
      throw skillPackageError('OFFICIAL_CONTENT_DISABLED', '该技能暂不可用', 403);
    }
    const safe = String(resourcePath || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    if (!safe.startsWith('references/') || safe.includes('..')) {
      throw skillPackageError('SKILL_RESOURCE_NOT_FOUND', '资源不存在', 404);
    }
    const targetRevision = revision ?? row.currentRevision;
    const pkg = row.packages.find((item) => item.revision === targetRevision);
    if (!pkg) {
      throw skillPackageError('SKILL_REVISION_UNAVAILABLE', '技能包版本不可用', 404);
    }
    const manifest = pkg.manifest as { references?: Array<{ path: string }> };
    const allowed = new Set(
      Array.isArray(manifest.references) ? manifest.references.map((item) => item.path) : [],
    );
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
    const row = await this.prisma.officialSkill.findUnique({ where: { id } });
    if (!row || !row.enabledAt || row.currentRevision < 1) {
      throw skillPackageError('OFFICIAL_CONTENT_DISABLED', '该技能暂不可用', 403);
    }
    if (expectedRevision != null && expectedRevision !== row.currentRevision) {
      throw skillPackageError('SKILL_REVISION_UNAVAILABLE', '技能包版本已更新，请刷新后重试', 409);
    }
    return {
      sessionSource: {
        type: 'skill' as const,
        id: row.id,
        key: row.key,
        name: row.name,
        packageRevision: row.currentRevision,
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
        enabledAt: { not: null },
        currentRevision: { gt: 0 },
      },
      select: {
        id: true,
        key: true,
        name: true,
        summary: true,
        category: true,
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
        category: legacySkillCategory(row.category),
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

  private async persistNewSkill(actor: User, parsed: ParsedSkillPackage, sourceZip?: Buffer) {
    // Create skill row first to get id for storage path; then package + point current.
    const created = await this.prisma.officialSkill.create({
      data: {
        key: parsed.manifest.key,
        name: parsed.manifest.name,
        summary: parsed.manifest.description,
        category: parsed.manifest.category ?? null,
        enabledAt: null,
        currentRevision: 0,
      },
    });
    try {
      const revision = 1;
      const written = await writeSkillPackageToDisk(created.id, revision, parsed, sourceZip);
      const pkg = await this.prisma.officialSkillPackage.create({
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
      await this.prisma.officialSkill.update({
        where: { id: created.id },
        data: {
          currentRevision: revision,
          currentPackageId: pkg.id,
          name: parsed.manifest.name,
          summary: parsed.manifest.description,
          category: parsed.manifest.category ?? null,
        },
      });
    } catch (error) {
      await this.prisma.officialSkill.delete({ where: { id: created.id } }).catch(() => undefined);
      throw error;
    }
    await this.audit(actor.id, 'admin_create_official_skill', {
      skillId: created.id,
      key: created.key,
      revision: 1,
    });
    return this.adminDetail(created.id, { includeInstruction: true });
  }

  private async replacePackage(
    actor: User,
    row: SkillRow,
    parsed: ParsedSkillPackage,
    sourceZip?: Buffer,
  ) {
    const revision = row.currentRevision + 1;
    const written = await writeSkillPackageToDisk(row.id, revision, parsed, sourceZip);
    const pkg = await this.prisma.officialSkillPackage.create({
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
    await this.prisma.officialSkill.update({
      where: { id: row.id },
      data: {
        currentRevision: revision,
        currentPackageId: pkg.id,
        name: parsed.manifest.name,
        summary: parsed.manifest.description,
        category: parsed.manifest.category ?? null,
      },
    });
    void actor;
  }

  private async syncCurrentManifestMeta(skillId: string) {
    const row = await this.requireSkill(skillId);
    if (!row.currentPackage) return;
    const prev = (row.currentPackage.manifest ?? {}) as Record<string, unknown>;
    const next = {
      ...prev,
      key: row.key,
      name: row.name,
      description: row.summary,
      entry: 'SKILL.md',
      ...(row.category ? { category: row.category } : {}),
    };
    await this.prisma.officialSkillPackage.update({
      where: { id: row.currentPackage.id },
      data: { manifest: next as Prisma.InputJsonValue },
    });
    // Also rewrite skill.json on disk best-effort.
    try {
      const abs = join(absoluteUploadPath(row.currentPackage.storagePath), 'skill.json');
      const { writeFile } = await import('fs/promises');
      await writeFile(abs, JSON.stringify(next, null, 2), 'utf8');
    } catch {
      /* ignore disk sync failure; DB is authority for meta */
    }
  }

  private applyOverrides(
    parsed: ParsedSkillPackage,
    overrides: { name?: string; summary?: string; category?: string | null },
  ) {
    if (overrides.name !== undefined && String(overrides.name).trim()) {
      parsed.manifest.name = assertSkillDisplayName(overrides.name);
    }
    if (overrides.summary !== undefined && String(overrides.summary).trim()) {
      parsed.manifest.description = assertSkillSummary(overrides.summary);
    }
    if (overrides.category !== undefined) {
      if (!overrides.category) parsed.manifest.category = undefined;
      else if (!isOfficialSkillCategory(overrides.category)) {
        throw new BadRequestException('分类不在允许范围内');
      } else parsed.manifest.category = overrides.category;
    }
    parsed.files.set(
      'skill.json',
      Buffer.from(
        JSON.stringify(
          {
            key: parsed.manifest.key,
            name: parsed.manifest.name,
            description: parsed.manifest.description,
            entry: 'SKILL.md',
            ...(parsed.manifest.category ? { category: parsed.manifest.category } : {}),
            ...(parsed.manifest.references ? { references: parsed.manifest.references } : {}),
          },
          null,
          2,
        ),
        'utf8',
      ),
    );
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
    if (!row) throw new NotFoundException('官方技能不存在');
    return row;
  }

  private presentAdmin(row: SkillRow) {
    return {
      id: row.id,
      avatarUrl: uploadedCatalogIconUrl(row.customAvatarPath),
      key: row.key,
      name: row.name,
      summary: row.summary,
      category: row.category,
      enabledAt: row.enabledAt?.toISOString() ?? null,
      enabled: Boolean(row.enabledAt),
      packageRevision: row.currentRevision,
      resourceCount: row.currentPackage?.resourceCount ?? 0,
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
    category: string | null;
    enabledAt: Date | null;
    currentRevision: number;
  }, industryTaxonomy = false) {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      summary: row.summary,
      category: industryTaxonomy ? row.category : legacySkillCategory(row.category),
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
}
