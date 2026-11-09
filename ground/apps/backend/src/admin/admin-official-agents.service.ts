import { normalizeDiscoveryDetail, expertDiscoveryDetail } from '../official-agent/discovery-detail';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizeExpertDefinition } from '../official-agent/expert-definition';
import { legacySkillCategory } from '../official-skill/skill-package';
import { existsSync } from 'fs';
import {
  OfficialAgentStatus,
  OfficialAgentGrantStatus,
  Prisma,
  TenantType,
  User,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminSupportService } from './admin-support.service';
import {
  CreateOfficialAgentDto,
  GrantOfficialAgentDto,
  ListOfficialAgentsDto,
  UpdateOfficialAgentDto,
} from './dto/official-agent.dto';
import { loadOfficialAgentAssets } from '../official-agent/official-agent-assets';
import {
  isOfficialAgentCategory,
  normalizeCapabilities,
} from '../official-agent/gallery-presentation';
import { resolvePresentedOfficialAvatarUrl } from '../official-agent/gallery-avatars';
import { OfficialKbService } from '../official-agent/official-kb.service';
import { OfficialSkillService } from '../official-skill/official-skill.service';
import {
  absoluteUploadPath,
  removeStoredFile,
  saveOfficialAvatar,
} from '../knowledge/storage';

const officialAgentInclude = {
  onlineVersion: true,
  versions: { orderBy: { version: 'desc' as const } },
  grants: {
    include: {
      tenant: { select: { id: true, name: true, slug: true, status: true } },
      version: { select: { id: true, version: true, name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  skillLinks: {
    include: {
      skill: {
        select: {
          id: true,
          key: true,
          name: true,
          summary: true,
          category: true,
          enabledAt: true,
          currentRevision: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.OfficialAgentInclude;

type OfficialAgentRow = Prisma.OfficialAgentGetPayload<{
  include: typeof officialAgentInclude;
}>;

type DraftConfig = {
  name: string;
  summary: string;
  openingQuestions: string[];
  systemPrompt: string;
  toolScope: string[];
};

@Injectable()
export class AdminOfficialAgentsService {
  constructor(
    private prisma: PrismaService,
    private support: AdminSupportService,
    private officialKb: OfficialKbService,
    private officialSkills: OfficialSkillService,
  ) {}

  async discovery(actor:User,id:string){
    await this.support.adminScope(actor);
    const row=await this.prisma.officialAgent.findUnique({where:{id},select:{id:true,name:true,updatedAt:true,expertDefinition:true,openingQuestions:true}});
    if(!row)throw new NotFoundException('专家不存在');
    // Pass openingQuestions so legacy experts without discoveryDetail.starters remain editable once.
    return {id:row.id,name:row.name,updatedAt:row.updatedAt.toISOString(),discoveryDetail:expertDiscoveryDetail(row.expertDefinition,row.openingQuestions)};
  }

  async saveDiscovery(actor:User,id:string,body:{expectedUpdatedAt:string;discoveryDetail:unknown}) {
    await this.support.adminScope(actor);
    await this.prisma.$transaction(async tx=>{
      const row=await tx.officialAgent.findUnique({where:{id}});
      if(!row)throw new NotFoundException('专家不存在');
      if(row.updatedAt.toISOString()!==body.expectedUpdatedAt)throw new ConflictException('专家已更新，请重新打开后保存');
      const definition=row.expertDefinition&&typeof row.expertDefinition==='object'&&!Array.isArray(row.expertDefinition)?row.expertDefinition:{};
      const previous=expertDiscoveryDetail(definition,row.openingQuestions);
      const discoveryDetail=normalizeDiscoveryDetail(body.discoveryDetail,previous);
      // Canonical recommended questions live in discoveryDetail.starters[].text.
      // Mirror into openingQuestions so publish/cards stay consistent; explicit [] disables fallback.
      const starterTexts=Array.isArray((discoveryDetail as {starters?: Array<{text?: string}>}).starters)
        ? (discoveryDetail as {starters: Array<{text: string}>}).starters.map((item)=>String(item.text||'').trim()).filter(Boolean).slice(0,3)
        : [];
      const result=await tx.officialAgent.updateMany({
        where:{id,updatedAt:row.updatedAt},
        data:{
          expertDefinition:{...definition,discoveryDetail} as Prisma.InputJsonObject,
          openingQuestions: starterTexts,
        },
      });
      if(result.count!==1)throw new ConflictException('专家已更新，请重新打开后保存');
      await tx.auditLog.create({data:{userId:actor.id,action:'admin_update_official_agent_draft',meta:{agentId:id,fields:['discoveryDetail','openingQuestions']}}});
    });
    return this.load(id);
  }

  async list(actor: User, query: ListOfficialAgentsDto) {
    await this.support.adminScope(actor);
    const keyword = query.keyword?.trim();
    const keywordWhere: Prisma.OfficialAgentWhereInput = keyword
      ? {
          OR: [
            { id: { contains: keyword, mode: 'insensitive' } },
            { name: { contains: keyword, mode: 'insensitive' } },
            { key: { contains: keyword, mode: 'insensitive' } },
            { summary: { contains: keyword, mode: 'insensitive' } },
          ],
        }
      : {};
    const [rows, grouped] = await Promise.all([
      this.prisma.officialAgent.findMany({
        where: {
          ...(query.status ? { status: query.status } : {}),
          ...keywordWhere,
        },
        include: officialAgentInclude,
        // Newest first so freshly created drafts surface on page 1; id break ties.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.officialAgent.groupBy({
        by: ['status'],
        where: keywordWhere,
        _count: { _all: true },
      }),
    ]);
    const statusCounts = {
      all: 0,
      DRAFT: 0,
      PUBLISHED: 0,
      OFFLINE: 0,
    };
    for (const row of grouped) {
      statusCounts[row.status] = row._count._all;
      statusCounts.all += row._count._all;
    }
    return {
      items: await this.presentMany(rows),
      statusCounts,
    };
  }

  async detail(actor: User, id: string) {
    await this.support.adminScope(actor);
    return this.load(id);
  }

  async create(actor: User, dto: CreateOfficialAgentDto) {
    await this.support.adminScope(actor);
    const existing = await this.prisma.officialAgent.findUnique({ where: { key: dto.key } });
    if (existing) throw new ConflictException('专家标识已存在');

    const draft = this.normalizeDraft(dto);
    const created = await this.prisma.$transaction(async (tx) => {
      const created = await tx.officialAgent.create({
      data: {
        key: dto.key,
        kind: dto.kind,
        ...draft,
        expertDefinition: normalizeExpertDefinition(dto.expertDefinition, draft),
        ...(dto.category && isOfficialAgentCategory(dto.category)
          ? { category: dto.category }
          : {}),
        ...(dto.capabilities !== undefined
          ? { capabilities: normalizeCapabilities(dto.capabilities) }
          : {}),
      },
      });
      if (dto.linkedSkillIds !== undefined) await this.officialSkills.setAgentSkillLinks(created.id, dto.linkedSkillIds, tx);
      return created;
    });
    await this.audit(actor.id, 'admin_create_official_agent', null, {
      agentId: created.id,
      key: created.key,
      kind: created.kind,
      linkedSkillIds: dto.linkedSkillIds ?? [],
    });
    return this.load(created.id);
  }

  /**
   * 从仓内 assets 幂等创建草稿。任何已存在的同 key 记录均跳过，不覆盖草稿、已发布版本或知识库。
   * 修改现有内容只能显式使用草稿编辑入口。
   */
  /** 仓内官方资产目录（不含提示词正文），供 Admin 勾选导入。 */
  async listAssetCatalog(actor: User) {
    await this.support.adminScope(actor);
    const assets = loadOfficialAgentAssets();
    const existing = await this.prisma.officialAgent.findMany({
      select: { key: true, id: true, status: true, onlineVersionId: true },
    });
    const byKey = new Map(existing.map((row) => [row.key, row]));
    return assets.map((asset) => {
      const row = byKey.get(asset.key);
      return {
        key: asset.key,
        name: asset.name,
        kind: asset.kind,
        summary: asset.summary,
        category: asset.category ?? null,
        capabilities: asset.capabilities ?? [],
        openingQuestionCount: asset.openingQuestions.length,
        toolScope: asset.toolScope,
        batch: asset.batch ?? null,
        linkedSkillKeys: asset.linkedSkillKeys,
        expertDefinition: asset.expertDefinition,
        existing: row
          ? {
              id: row.id,
              status: row.status,
              hasOnlineVersion: Boolean(row.onlineVersionId),
            }
          : null,
      };
    });
  }

  async importAssets(actor: User, keys?: string[]) {
    await this.support.adminScope(actor);
    const requested = [...new Set((keys ?? []).map((key) => key.trim()).filter(Boolean))];
    const assets = loadOfficialAgentAssets(requested.length ? requested : undefined);
    const found = new Set(assets.map((asset) => asset.key));
    const results: Array<{
      key: string;
      action: 'created' | 'updated' | 'filled' | 'skipped' | 'error';
      id?: string;
      reason?: string;
    }> = [];
    const errors: Array<{ key: string; message: string }> = [];
    for (const key of requested) {
      if (!found.has(key)) {
        const message = '资产包中不存在该 key';
        errors.push({ key, message });
        results.push({ key, action: 'error', reason: message });
      }
    }
    for (const asset of assets) {
      const existing = await this.prisma.officialAgent.findUnique({ where: { key: asset.key } });
      if (!existing) {
        const created = await this.prisma.$transaction(async (tx) => {
          const skills = asset.linkedSkillKeys.length ? await tx.officialSkill.findMany({
            where: { key: { in: asset.linkedSkillKeys }, deletedAt: null, enabledAt: { not: null }, currentRevision: { gt: 0 } }, select: { id: true },
          }) : [];
          if (skills.length !== asset.linkedSkillKeys.length) throw new BadRequestException(`专家 ${asset.key} 依赖的技能未启用或不存在`);
          const row = await tx.officialAgent.create({ data: {
            key: asset.key, kind: asset.kind, name: asset.name, summary: asset.summary,
            openingQuestions: asset.openingQuestions, systemPrompt: asset.systemPrompt, toolScope: asset.toolScope,
            ...(asset.category ? { category: asset.category } : {}), capabilities: asset.capabilities ?? [],
            expertDefinition: asset.expertDefinition,
          } });
          await this.officialSkills.setAgentSkillLinks(row.id, skills.map(skill => skill.id), tx);
          return row;
        });
        await this.audit(actor.id, 'admin_import_official_agent_asset', null, {
          agentId: created.id,
          key: created.key,
          action: 'created',
        });
        await this.syncOfficialKb(actor.id, created.id, asset.key, asset.kbFiles);
        results.push({ key: asset.key, action: 'created', id: created.id });
        continue;
      }

      results.push({ key: asset.key, action: 'skipped', id: existing.id, reason: '同 key 已存在，保留管理员草稿及已发布版本' });
    }
    await this.audit(actor.id, 'admin_import_official_agent_asset', null, {
      mode: 'batch',
      requestedCount: requested.length || assets.length,
      resultCount: results.length,
      created: results.filter((row) => row.action === 'created').length,
      updated: results.filter((row) => row.action === 'updated').length,
      filled: results.filter((row) => row.action === 'filled').length,
      skipped: results.filter((row) => row.action === 'skipped').length,
      errors: errors.length,
      keys: results.map((row) => row.key),
    });
    return {
      imported: results.filter((row) => row.action !== 'error').length,
      results,
      errors,
      summary: {
        created: results.filter((row) => row.action === 'created').length,
        updated: results.filter((row) => row.action === 'updated').length,
        filled: results.filter((row) => row.action === 'filled').length,
        skipped: results.filter((row) => row.action === 'skipped').length,
        errors: errors.length,
      },
    };
  }

  async bulkOffline(actor: User, ids: string[]) {
    await this.support.adminScope(actor);
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (!uniqueIds.length) throw new BadRequestException('请选择要下架的专家');
    const results: Array<{
      id: string;
      key?: string;
      action: 'offlined' | 'skipped' | 'error';
      reason?: string;
    }> = [];
    for (const id of uniqueIds) {
      const agent = await this.prisma.officialAgent.findUnique({ where: { id } });
      if (!agent) {
        results.push({ id, action: 'error', reason: '官方专家不存在' });
        continue;
      }
      if (agent.status !== OfficialAgentStatus.PUBLISHED) {
        results.push({
          id,
          key: agent.key,
          action: 'skipped',
          reason: `status=${agent.status}`,
        });
        continue;
      }
      await this.prisma.officialAgent.update({
        where: { id },
        data: { status: OfficialAgentStatus.OFFLINE },
      });
      await this.audit(actor.id, 'admin_offline_official_agent', null, {
        agentId: id,
        key: agent.key,
        versionId: agent.onlineVersionId,
        bulk: true,
      });
      results.push({ id, key: agent.key, action: 'offlined' });
    }
    await this.audit(actor.id, 'admin_bulk_offline_official_agent', null, {
      requestedCount: uniqueIds.length,
      offlined: results.filter((row) => row.action === 'offlined').length,
      skipped: results.filter((row) => row.action === 'skipped').length,
      errors: results.filter((row) => row.action === 'error').length,
      agentIds: results.filter((row) => row.action === 'offlined').map((row) => row.id),
    });
    return {
      results,
      summary: {
        offlined: results.filter((row) => row.action === 'offlined').length,
        skipped: results.filter((row) => row.action === 'skipped').length,
        errors: results.filter((row) => row.action === 'error').length,
      },
    };
  }

  async bulkGrant(actor: User, id: string, tenantIds: string[], versionId?: string) {
    await this.support.adminScope(actor);
    const agent = await this.requireAgent(id);
    if (agent.status !== OfficialAgentStatus.PUBLISHED || !agent.onlineVersionId) {
      throw new BadRequestException('请先发布专家，再开通企业');
    }
    const uniqueTenantIds = [...new Set(tenantIds.map((value) => value.trim()).filter(Boolean))];
    if (!uniqueTenantIds.length) throw new BadRequestException('请选择要开通的企业');
    const targetVersionId = versionId ?? agent.onlineVersionId;
    const version = await this.prisma.officialAgentVersion.findFirst({
      where: { id: targetVersionId, agentId: id },
      select: { id: true, version: true },
    });
    if (!version) throw new BadRequestException('所选版本不属于该专家');

    const results: Array<{
      tenantId: string;
      action: 'granted' | 'reactivated' | 'upgraded' | 'skipped' | 'error';
      reason?: string;
      versionId?: string;
    }> = [];

    for (const tenantId of uniqueTenantIds) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant || tenant.type !== TenantType.ENTERPRISE) {
        results.push({ tenantId, action: 'error', reason: '试点企业不存在' });
        continue;
      }
      if (tenant.status !== 'active') {
        results.push({ tenantId, action: 'error', reason: '停用企业不能开通专家' });
        continue;
      }
      const previous = await this.prisma.officialAgentTenantGrant.findUnique({
        where: { agentId_tenantId: { agentId: id, tenantId } },
      });
      if (
        previous
        && previous.status === OfficialAgentGrantStatus.ACTIVE
        && previous.versionId === targetVersionId
      ) {
        results.push({
          tenantId,
          action: 'skipped',
          reason: '已开通且版本未变',
          versionId: targetVersionId,
        });
        continue;
      }
      await this.prisma.officialAgentTenantGrant.upsert({
        where: { agentId_tenantId: { agentId: id, tenantId } },
        update: {
          versionId: targetVersionId,
          status: OfficialAgentGrantStatus.ACTIVE,
          grantedByUserId: actor.id,
          revokedAt: null,
        },
        create: {
          agentId: id,
          tenantId,
          versionId: targetVersionId,
          grantedByUserId: actor.id,
        },
      });
      const action =
        previous?.status === OfficialAgentGrantStatus.REVOKED
          ? 'reactivated'
          : previous
            ? 'upgraded'
            : 'granted';
      await this.audit(actor.id, 'admin_grant_official_agent', tenantId, {
        agentId: id,
        previousVersionId: previous?.versionId ?? null,
        versionId: targetVersionId,
        version: version.version,
        reactivated: previous?.status === OfficialAgentGrantStatus.REVOKED,
        bulk: true,
      });
      results.push({ tenantId, action, versionId: targetVersionId });
    }

    await this.audit(actor.id, 'admin_bulk_grant_official_agent', null, {
      agentId: id,
      versionId: targetVersionId,
      version: version.version,
      requestedCount: uniqueTenantIds.length,
      granted: results.filter((row) => row.action === 'granted').length,
      reactivated: results.filter((row) => row.action === 'reactivated').length,
      upgraded: results.filter((row) => row.action === 'upgraded').length,
      skipped: results.filter((row) => row.action === 'skipped').length,
      errors: results.filter((row) => row.action === 'error').length,
      tenantIds: results
        .filter((row) => ['granted', 'reactivated', 'upgraded'].includes(row.action))
        .map((row) => row.tenantId),
    });

    return {
      agent: await this.load(id),
      results,
      summary: {
        granted: results.filter((row) => row.action === 'granted').length,
        reactivated: results.filter((row) => row.action === 'reactivated').length,
        upgraded: results.filter((row) => row.action === 'upgraded').length,
        skipped: results.filter((row) => row.action === 'skipped').length,
        errors: results.filter((row) => row.action === 'error').length,
      },
    };
  }

  async bulkRevoke(actor: User, id: string, tenantIds: string[]) {
    await this.support.adminScope(actor);
    await this.requireAgent(id);
    const uniqueTenantIds = [...new Set(tenantIds.map((value) => value.trim()).filter(Boolean))];
    if (!uniqueTenantIds.length) throw new BadRequestException('请选择要撤销的企业');
    const results: Array<{
      tenantId: string;
      action: 'revoked' | 'skipped' | 'error';
      reason?: string;
      versionId?: string | null;
    }> = [];
    for (const tenantId of uniqueTenantIds) {
      const grant = await this.prisma.officialAgentTenantGrant.findUnique({
        where: { agentId_tenantId: { agentId: id, tenantId } },
      });
      if (!grant || grant.status === OfficialAgentGrantStatus.REVOKED) {
        results.push({
          tenantId,
          action: 'skipped',
          reason: '该企业尚未开通此专家',
        });
        continue;
      }
      await this.prisma.officialAgentTenantGrant.update({
        where: { id: grant.id },
        data: { status: OfficialAgentGrantStatus.REVOKED, revokedAt: new Date() },
      });
      await this.audit(actor.id, 'admin_revoke_official_agent', tenantId, {
        agentId: id,
        versionId: grant.versionId,
        bulk: true,
      });
      results.push({ tenantId, action: 'revoked', versionId: grant.versionId });
    }
    await this.audit(actor.id, 'admin_bulk_revoke_official_agent', null, {
      agentId: id,
      requestedCount: uniqueTenantIds.length,
      revoked: results.filter((row) => row.action === 'revoked').length,
      skipped: results.filter((row) => row.action === 'skipped').length,
      errors: results.filter((row) => row.action === 'error').length,
      tenantIds: results.filter((row) => row.action === 'revoked').map((row) => row.tenantId),
    });
    return {
      agent: await this.load(id),
      results,
      summary: {
        revoked: results.filter((row) => row.action === 'revoked').length,
        skipped: results.filter((row) => row.action === 'skipped').length,
        errors: results.filter((row) => row.action === 'error').length,
      },
    };
  }

  async update(actor: User, id: string, dto: UpdateOfficialAgentDto) {
    await this.support.adminScope(actor);
    const existing = await this.requireAgent(id);
    const data: Prisma.OfficialAgentUpdateInput = {};
    if (dto.name !== undefined) data.name = this.requiredText(dto.name, '名称');
    if (dto.summary !== undefined) data.summary = dto.summary.trim();
    if (dto.openingQuestions !== undefined) {
      data.openingQuestions = this.normalizeList(dto.openingQuestions);
    }
    if (dto.systemPrompt !== undefined) {
      data.systemPrompt = dto.systemPrompt.trim();
    }
    if (dto.toolScope !== undefined) data.toolScope = this.normalizeList(dto.toolScope);
    if (dto.category !== undefined) {
      if (!isOfficialAgentCategory(dto.category)) {
        throw new BadRequestException('分类无效');
      }
      data.category = dto.category;
    }
    if (dto.capabilities !== undefined) {
      data.capabilities = normalizeCapabilities(dto.capabilities);
    }
    if (dto.expertDefinition !== undefined) data.expertDefinition = normalizeExpertDefinition(dto.expertDefinition, { name: dto.name ?? existing.name, summary: dto.summary ?? existing.summary });
    if (!Object.keys(data).length && dto.linkedSkillIds === undefined) {
      throw new BadRequestException('没有可保存的修改');
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.officialAgent.update({ where: { id }, data });
      if (dto.linkedSkillIds !== undefined) await this.officialSkills.setAgentSkillLinks(id, dto.linkedSkillIds, tx);
    });
    await this.audit(actor.id, 'admin_update_official_agent_draft', null, {
      agentId: id,
      fields: [
        ...Object.keys(data),
        ...(dto.linkedSkillIds !== undefined ? ['linkedSkillIds'] : []),
      ],
    });
    return this.load(id);
  }

  async publish(actor: User, id: string) {
    await this.support.adminScope(actor);
    try {
      await this.prisma.$transaction(async (tx) => {
        const agent = await tx.officialAgent.findUnique({
          where: { id },
          include: { skillLinks: true },
        });
        if (!agent) throw new NotFoundException('官方专家不存在');
        this.assertPublishable(agent);
        const linkedSkillSummaries = await this.officialSkills.snapshotLinkedSkills(id, tx);
        const latest = await tx.officialAgentVersion.findFirst({
          where: { agentId: id },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const published = await tx.officialAgentVersion.create({
          data: {
            agentId: id,
            version: (latest?.version ?? 0) + 1,
            name: agent.name,
            summary: agent.summary,
            openingQuestions: this.frozenStringList(agent.openingQuestions, '开场问题'),
            systemPrompt: agent.systemPrompt,
            toolScope: this.frozenStringList(agent.toolScope, '工具范围'),
            customAvatarPath: agent.customAvatarPath || null,
            linkedSkillSummaries: linkedSkillSummaries as unknown as Prisma.InputJsonValue,
            expertDefinition: normalizeExpertDefinition(agent.expertDefinition, agent),
            publishedByUserId: actor.id,
          },
        });
        await tx.officialAgent.update({
          where: { id },
          data: {
            status: OfficialAgentStatus.PUBLISHED,
            onlineVersion: { connect: { id: published.id } },
          },
        });
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'admin_publish_official_agent',
            meta: { agentId: id, versionId: published.id, version: published.version },
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        throw new ConflictException('发布冲突，请重试');
      }
      throw error;
    }
    const published = await this.load(id);
    const asset = loadOfficialAgentAssets([published.key])[0];
    if (asset?.kbFiles?.length) {
      await this.syncOfficialKb(
        actor.id,
        published.id,
        published.key,
        asset.kbFiles,
        published.onlineVersion?.id,
      );
    }
    return published;
  }

  async offline(actor: User, id: string) {
    await this.support.adminScope(actor);
    const agent = await this.requireAgent(id);
    if (agent.status !== OfficialAgentStatus.PUBLISHED) {
      throw new BadRequestException('只有已发布的专家可以下架');
    }
    await this.prisma.officialAgent.update({
      where: { id },
      data: { status: OfficialAgentStatus.OFFLINE },
    });
    await this.audit(actor.id, 'admin_offline_official_agent', null, {
      agentId: id,
      versionId: agent.onlineVersionId,
    });
    return this.load(id);
  }

  /**
   * Physical delete. Cascades versions/grants/skillLinks/official KB owned by this expert.
   * Does not touch OfficialSkill bodies, user sessions/messages, or enterprise libraries.
   * Host sessions keep frozen binding snapshots; new starts fail because the catalog row is gone.
   */
  async remove(actor: User, id: string) {
    await this.support.adminScope(actor);
    let avatarPath: string | null | undefined;
    let snapshot: { id: string; key: string; name: string; status: OfficialAgentStatus };
    try {
      await this.prisma.$transaction(async (tx) => {
        const agent = await tx.officialAgent.findUnique({ where: { id } });
        if (!agent) throw new NotFoundException('官方专家不存在');
        avatarPath = agent.customAvatarPath;
        snapshot = { id: agent.id, key: agent.key, name: agent.name, status: agent.status };
        // Break OfficialAgent.onlineVersionId ↔ Version circular FK before cascading versions.
        if (agent.onlineVersionId) {
          await tx.officialAgent.update({
            where: { id },
            data: { onlineVersion: { disconnect: true } },
          });
        }
        await tx.officialAgent.delete({ where: { id } });
        // Preferences are soft references (no FK); clear so favourites cannot resurrect UI ghosts.
        await tx.officialCatalogPreference.deleteMany({
          where: { kind: 'expert', resourceId: id },
        });
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'admin_delete_official_agent',
            meta: {
              agentId: snapshot.id,
              key: snapshot.key,
              name: snapshot.name,
              status: snapshot.status,
            },
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034' || error.code === 'P2025')
      ) {
        throw new ConflictException('删除冲突，请刷新后重试');
      }
      throw error;
    }
    if (avatarPath) {
      try {
        await removeStoredFile(avatarPath);
      } catch {
        // Orphan avatar file is acceptable; config row is already gone.
      }
    }
    return { ok: true as const, id: snapshot!.id, key: snapshot!.key, name: snapshot!.name };
  }

  async grant(actor: User, id: string, dto: GrantOfficialAgentDto) {
    await this.support.adminScope(actor);
    const agent = await this.requireAgent(id);
    if (agent.status !== OfficialAgentStatus.PUBLISHED || !agent.onlineVersionId) {
      throw new BadRequestException('请先发布专家，再开通企业');
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant || tenant.type !== TenantType.ENTERPRISE) {
      throw new NotFoundException('试点企业不存在');
    }
    if (tenant.status !== 'active') throw new BadRequestException('停用企业不能开通专家');

    const versionId = dto.versionId ?? agent.onlineVersionId;
    const version = await this.prisma.officialAgentVersion.findFirst({
      where: { id: versionId, agentId: id },
      select: { id: true, version: true },
    });
    if (!version) throw new BadRequestException('所选版本不属于该专家');

    const previous = await this.prisma.officialAgentTenantGrant.findUnique({
      where: { agentId_tenantId: { agentId: id, tenantId: dto.tenantId } },
    });
    await this.prisma.officialAgentTenantGrant.upsert({
      where: { agentId_tenantId: { agentId: id, tenantId: dto.tenantId } },
      update: {
        versionId,
        status: OfficialAgentGrantStatus.ACTIVE,
        grantedByUserId: actor.id,
        revokedAt: null,
      },
      create: {
        agentId: id,
        tenantId: dto.tenantId,
        versionId,
        grantedByUserId: actor.id,
      },
    });
    await this.audit(actor.id, 'admin_grant_official_agent', dto.tenantId, {
      agentId: id,
      previousVersionId: previous?.versionId ?? null,
      versionId,
      version: version.version,
      reactivated: previous?.status === OfficialAgentGrantStatus.REVOKED,
    });
    return this.load(id);
  }

  async revoke(actor: User, id: string, tenantId: string) {
    await this.support.adminScope(actor);
    await this.requireAgent(id);
    const grant = await this.prisma.officialAgentTenantGrant.findUnique({
      where: { agentId_tenantId: { agentId: id, tenantId } },
    });
    if (!grant || grant.status === OfficialAgentGrantStatus.REVOKED) {
      throw new BadRequestException('该企业尚未开通此专家');
    }
    await this.prisma.officialAgentTenantGrant.update({
      where: { id: grant.id },
      data: { status: OfficialAgentGrantStatus.REVOKED, revokedAt: new Date() },
    });
    await this.audit(actor.id, 'admin_revoke_official_agent', tenantId, {
      agentId: id,
      versionId: grant.versionId,
    });
    return this.load(id);
  }

  private async requireAgent(id: string) {
    const agent = await this.prisma.officialAgent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException('官方专家不存在');
    return agent;
  }

  private async load(id: string) {
    const row = await this.prisma.officialAgent.findUnique({
      where: { id },
      include: officialAgentInclude,
    });
    if (!row) throw new NotFoundException('官方专家不存在');
    const [presented] = await this.presentMany([row]);
    return presented;
  }

  private async presentMany(rows: OfficialAgentRow[]) {
    const avatarByKey = this.avatarExplicitByKey();
    const publisherIds = rows.flatMap((row) =>
      row.versions.map((version) => version.publishedByUserId),
    );
    const publisherNames = await this.loadPublisherNames(publisherIds);
    return rows.map((row) => this.present(row, avatarByKey, publisherNames));
  }

  private async loadPublisherNames(userIds: Array<string | null | undefined>) {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (!ids.length) return new Map<string, string>();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(users.map((user) => [user.id, user.name]));
  }


  /** Publish requires complete public+execution essentials; save may keep incomplete drafts. */
  private assertPublishable(agent: {
    name: string;
    summary: string;
    systemPrompt: string;
    expertDefinition: Prisma.JsonValue;
    toolScope: Prisma.JsonValue;
    skillLinks?: Array<{ skillId: string }>;
  }) {
    const missing: string[] = [];
    if (!agent.name.trim()) missing.push('专家名称');
    if (!agent.summary.trim()) missing.push('一句话介绍');
    if (!agent.systemPrompt.trim()) missing.push('专家指令');
    const definition = normalizeExpertDefinition(agent.expertDefinition, agent);
    const profile =
      definition.profile && typeof definition.profile === 'object' && !Array.isArray(definition.profile)
        ? (definition.profile as Record<string, unknown>)
        : {};
    // Storage may fill role from name on save; frontend still requires an explicit 角色定位 before publish.
    const role = typeof profile.role === 'string' ? profile.role.trim() : '';
    if (!role) missing.push('角色定位');
    const tools = Array.isArray(agent.toolScope)
      ? agent.toolScope.filter((item): item is string => typeof item === 'string')
      : [];
    const allowedTools = new Set([
      'enterprise_knowledge',
      'web_search',
      'web_fetch',
      'tabular_analyze',
      'delegate_official_agent',
      'delegate',
    ]);
    if (tools.some((tool) => tool && !allowedTools.has(tool))) {
      missing.push('可用工具（存在无效标识）');
    }
    void agent.skillLinks;
    if (missing.length) {
      throw new BadRequestException(`发布前请完善：${missing.join('、')}`);
    }
  }

  /** Sort object keys recursively so Postgres jsonb key-order churn cannot fake diffs. */
  private stableJson(value: unknown): string {
    const sortKeys = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map(sortKeys);
      if (input && typeof input === 'object') {
        return Object.fromEntries(
          Object.keys(input as Record<string, unknown>)
            .sort()
            .map((key) => [key, sortKeys((input as Record<string, unknown>)[key])]),
        );
      }
      return input;
    };
    return JSON.stringify(sortKeys(value) ?? null);
  }

  private hasUnpublishedChanges(row: OfficialAgentRow): boolean {
    const online = row.onlineVersion;
    if (!online) return false;
    const draftSkillIds = row.skillLinks.map((link) => link.skillId).slice().sort();
    const onlineSkillIds = (
      Array.isArray(online.linkedSkillSummaries)
        ? online.linkedSkillSummaries
            .map((item) =>
              item && typeof item === 'object' && 'id' in item
                ? String((item as { id?: unknown }).id ?? '')
                : '',
            )
            .filter(Boolean)
        : []
    ).slice().sort();
    // Compare semantic snapshots on both sides. discoveryDetail lives inside expertDefinition,
    // so plaza-intro saves are included; jsonb key order must not create false positives.
    const draftAvatar = row.customAvatarPath || null;
    const onlineAvatar =
      'customAvatarPath' in online
        ? ((online as { customAvatarPath?: string | null }).customAvatarPath || null)
        : null;
    return !(
      row.name === online.name &&
      row.summary === online.summary &&
      row.systemPrompt === online.systemPrompt &&
      draftAvatar === onlineAvatar &&
      this.stableJson(row.openingQuestions) === this.stableJson(online.openingQuestions) &&
      this.stableJson(row.toolScope) === this.stableJson(online.toolScope) &&
      this.stableJson(normalizeExpertDefinition(row.expertDefinition, row)) ===
        this.stableJson(
          normalizeExpertDefinition(online.expertDefinition, {
            name: online.name,
            summary: online.summary,
          }),
        ) &&
      this.stableJson(draftSkillIds) === this.stableJson(onlineSkillIds)
    );
  }

  private present(
    row: OfficialAgentRow,
    avatarByKey: Map<string, string | null> = this.avatarExplicitByKey(),
    publisherNames: Map<string, string> = new Map(),
  ) {
    return {
      id: row.id,
      key: row.key,
      kind: row.kind,
      category: row.category,
      capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
      status: row.status,
      hasUnpublishedChanges: this.hasUnpublishedChanges(row),
      avatarUrl: this.resolveAvatarUrl(
        row.key,
        avatarByKey.get(row.key) ?? null,
        row.customAvatarPath ?? null,
      ),
      linkedSkillIds: row.skillLinks.map(link => link.skillId),
      linkedSkills: row.skillLinks.map(({ skill }) => ({ id: skill.id, key: skill.key, name: skill.name, summary: skill.summary, category: legacySkillCategory(skill.category), enabledAt: skill.enabledAt?.toISOString() ?? null, packageRevision: skill.currentRevision, enabled: skill.enabledAt !== null })),
      draft: {
        name: row.name,
        summary: row.summary,
        openingQuestions: row.openingQuestions,
        systemPrompt: row.systemPrompt,
        toolScope: row.toolScope,
        expertDefinition: row.expertDefinition,
      },
      onlineVersion: row.onlineVersion
        ? this.presentVersion(row.onlineVersion, publisherNames)
        : null,
      versions: row.versions.map((version) => this.presentVersion(version, publisherNames)),
      grants: row.grants.map((grant) => ({
        id: grant.id,
        tenant: grant.tenant,
        version: grant.version,
        status: grant.status,
        revokedAt: grant.revokedAt,
        createdAt: grant.createdAt,
        updatedAt: grant.updatedAt,
      })),
      activeGrantCount: row.grants.filter(
        (grant) => grant.status === OfficialAgentGrantStatus.ACTIVE,
      ).length,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Asset-declared avatar remaps (e.g. niche → avatars/data.jpg). */
  private avatarExplicitByKey(): Map<string, string | null> {
    return new Map(
      loadOfficialAgentAssets().map((asset) => [asset.key, asset.avatar ?? null] as const),
    );
  }

  /**
   * Admin list/detail branding URL. Priority: custom uploaded → packaged asset default.
   * Null → UI first-character fallback. Never invents paths.
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

  /**
   * Upload / replace Admin custom avatar for one official agent.
   * Persists immediately (not draft-gated); does not publish prompt/config.
   */
  async uploadAvatar(
    actor: User,
    id: string,
    file:
      | { originalname: string; mimetype: string; size: number; buffer: Buffer }
      | undefined,
  ) {
    await this.support.adminScope(actor);
    if (!file?.buffer?.length) throw new BadRequestException('请选择头像图片');
    const current = await this.prisma.officialAgent.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('官方专家不存在');
    let storagePath: string;
    try {
      storagePath = await saveOfficialAvatar(
        current.id,
        file.originalname || 'avatar.png',
        file.buffer,
        file.mimetype,
      );
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '头像上传失败');
    }
    // Confirm file landed before swapping DB pointer.
    const abs = absoluteUploadPath(storagePath);
    if (!existsSync(abs)) {
      throw new BadRequestException('头像写入失败');
    }
    await this.prisma.officialAgent.update({
      where: { id },
      data: { customAvatarPath: storagePath },
    });
    // Never delete a file still frozen on any published version snapshot.
    if (current.customAvatarPath && current.customAvatarPath !== storagePath) {
      const referenced = await this.prisma.officialAgentVersion.count({
        where: { customAvatarPath: current.customAvatarPath },
      });
      if (referenced === 0) {
        await removeStoredFile(current.customAvatarPath);
      }
    }
    await this.audit(actor.id, 'admin_upload_official_agent_avatar', null, {
      agentId: id,
      key: current.key,
      customAvatarPath: storagePath,
    });
    return this.load(id);
  }

  async removeAvatar(actor: User, id: string) {
    await this.support.adminScope(actor);
    const current = await this.requireAgent(id);
    const previous = current.customAvatarPath || null;
    await this.prisma.officialAgent.update({ where: { id }, data: { customAvatarPath: '' } });
    if (previous) {
      const referenced = await this.prisma.officialAgentVersion.count({
        where: { customAvatarPath: previous },
      });
      if (referenced === 0) await removeStoredFile(previous);
    }
    await this.audit(actor.id, 'admin_remove_official_agent_avatar', null, { agentId: id });
    return this.load(id);
  }

  private presentVersion(
    version: OfficialAgentRow['versions'][number],
    publisherNames: Map<string, string> = new Map(),
  ) {
    const publishedByUserId = version.publishedByUserId ?? null;
    const publishedByName =
      publishedByUserId && publisherNames.has(publishedByUserId)
        ? publisherNames.get(publishedByUserId) ?? null
        : null;
    return {
      id: version.id,
      version: version.version,
      name: version.name,
      summary: version.summary,
      openingQuestions: version.openingQuestions,
      systemPrompt: version.systemPrompt,
      toolScope: version.toolScope,
      expertDefinition: version.expertDefinition,
      linkedSkillSummaries: Array.isArray(version.linkedSkillSummaries)
        ? version.linkedSkillSummaries
        : [],
      publishedByUserId,
      // Only expose a real name when the user row still exists; never invent operators.
      publishedByName,
      publishedAt: version.publishedAt,
    };
  }

  private normalizeDraft(dto: CreateOfficialAgentDto): DraftConfig {
    // Save allows incomplete drafts; publish runs assertPublishable for required fields.
    return {
      name: this.requiredText(dto.name, '专家名称'),
      summary: (dto.summary ?? '').trim(),
      openingQuestions: this.normalizeList(dto.openingQuestions ?? []),
      systemPrompt: (dto.systemPrompt ?? '').trim(),
      toolScope: this.normalizeList(dto.toolScope ?? []),
    };
  }

  private normalizeList(values: string[]) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private frozenStringList(value: Prisma.JsonValue, label: string): string[] {
    if (!Array.isArray(value)) throw new BadRequestException(`${label}草稿格式异常，请重新保存`);
    const strings = value.filter((item): item is string => typeof item === 'string');
    if (strings.length !== value.length) {
      throw new BadRequestException(`${label}草稿格式异常，请重新保存`);
    }
    return strings;
  }

  private requiredText(value: string, label: string) {
    const text = value.trim();
    if (!text) throw new BadRequestException(`${label}不能只包含空白字符`);
    return text;
  }

  private async syncOfficialKb(
    actorUserId: string,
    agentId: string,
    agentKey: string,
    kbFiles: import('../official-agent/official-agent-assets').OfficialKbAssetFile[],
    versionId?: string | null,
  ) {
    if (!kbFiles?.length) return;
    const files = this.officialKb.loadAssetFiles(agentKey, kbFiles);
    const synced = await this.officialKb.syncFromAssets(agentId, files, versionId);
    await this.audit(actorUserId, 'admin_sync_official_kb', null, {
      agentId,
      agentKey,
      versionId: versionId ?? null,
      documentCount: synced.length,
      documentIds: synced.map((row) => row.documentId),
      statuses: synced.map((row) => row.status),
    });
  }

  private async audit(
    actorUserId: string,
    action: string,
    tenantId: string | null,
    meta: Prisma.InputJsonObject,
  ) {
    await this.prisma.auditLog.create({
      data: { userId: actorUserId, action, tenantId, meta },
    });
  }
}
