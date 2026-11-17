import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { assertSuperAdmin } from '../auth/super-admin';
import {
  loadOfficialAgentAssets,
  type OfficialKbAssetFile,
} from '../official-agent/official-agent-assets';
import {
  expertDiscoveryDetail,
  normalizeDiscoveryDetail,
} from '../official-agent/discovery-detail';
import {
  AdminOfficialAgentDeps,
  AdminOfficialAgentPresenter,
  auditOfficialAgent,
} from './admin-official-agent.presenter';

/**
 * 发现页与仓内资产导入簇（审计 P1-2 D+E 簇）。
 * `syncOfficialAgentKb` 以模块函数形式导出，供发布簇在发布后复用同一段 KB 同步逻辑，
 * 依赖方向为 发布 → 发现，单向，不构成环。
 */
export class AdminOfficialAgentDiscoveryService {
  constructor(
    private readonly deps: () => AdminOfficialAgentDeps,
    private readonly presenter: AdminOfficialAgentPresenter,
  ) {}

  async discovery(actor:User,id:string){
    const { prisma, support } = this.deps();
    await support.adminScope(actor);
    const row=await prisma.officialAgent.findUnique({where:{id},select:{id:true,name:true,updatedAt:true,expertDefinition:true,openingQuestions:true}});
    if(!row)throw new NotFoundException('专家不存在');
    // Pass openingQuestions so legacy experts without discoveryDetail.starters remain editable once.
    return {id:row.id,name:row.name,updatedAt:row.updatedAt.toISOString(),discoveryDetail:expertDiscoveryDetail(row.expertDefinition,row.openingQuestions)};
  }

  async saveDiscovery(actor:User,id:string,body:{expectedUpdatedAt:string;discoveryDetail:unknown}) {
    const { prisma } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
    await prisma.$transaction(async tx=>{
      const row=await tx.officialAgent.findUnique({where:{id}});
      if(!row)throw new NotFoundException('专家不存在');
      if(row.updatedAt.toISOString()!==body.expectedUpdatedAt)throw new ConflictException('专家已更新，请重新打开后保存');
      const definition=row.expertDefinition&&typeof row.expertDefinition==='object'&&!Array.isArray(row.expertDefinition)?row.expertDefinition:{};
      const previous=expertDiscoveryDetail(definition,row.openingQuestions);
      const discoveryDetail=normalizeDiscoveryDetail(body.discoveryDetail,previous);
      // Canonical recommended questions live in discoveryDetail.starters[].text.
      // Mirror into openingQuestions so publish/cards stay consistent; explicit [] disables fallback.
      const starterTexts=Array.isArray((discoveryDetail as {starters?: Array<{text?: string}>}).starters)
        ? (discoveryDetail as {starters: Array<{text: string}>}).starters.map((item)=>String(item.text||'').trim()).filter(Boolean).slice(0,4)
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
    return this.presenter.load(id);
  }

  /**
   * 从仓内 assets 幂等创建草稿。任何已存在的同 key 记录均跳过，不覆盖草稿、已发布版本或知识库。
   * 修改现有内容只能显式使用草稿编辑入口。
   */
  /** 仓内官方资产目录（不含提示词正文），供 Admin 勾选导入。 */
  async listAssetCatalog(actor: User) {
    const { prisma, support } = this.deps();
    await support.adminScope(actor);
    const assets = loadOfficialAgentAssets();
    const existing = await prisma.officialAgent.findMany({
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
    const { prisma, officialSkills } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
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
      const existing = await prisma.officialAgent.findUnique({ where: { key: asset.key } });
      if (!existing) {
        const created = await prisma.$transaction(async (tx) => {
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
          await officialSkills.setAgentSkillLinks(row.id, skills.map(skill => skill.id), tx);
          return row;
        });
        await auditOfficialAgent(prisma, actor.id, 'admin_import_official_agent_asset', null, {
          agentId: created.id,
          key: created.key,
          action: 'created',
        });
        await syncOfficialAgentKb(this.deps(), actor.id, created.id, asset.key, asset.kbFiles);
        results.push({ key: asset.key, action: 'created', id: created.id });
        continue;
      }

      results.push({ key: asset.key, action: 'skipped', id: existing.id, reason: '同 key 已存在，保留管理员草稿及已发布版本' });
    }
    await auditOfficialAgent(prisma, actor.id, 'admin_import_official_agent_asset', null, {
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
}

/** 仓内资产 KB 同步：发布与导入共用，审计动作与统计字段与原实现一致。 */
export async function syncOfficialAgentKb(
  deps: AdminOfficialAgentDeps,
  actorUserId: string,
  agentId: string,
  agentKey: string,
  kbFiles: OfficialKbAssetFile[],
  versionId?: string | null,
) {
  if (!kbFiles?.length) return;
  const files = deps.officialKb.loadAssetFiles(agentKey, kbFiles);
  const synced = await deps.officialKb.syncFromAssets(agentId, files, versionId);
  await auditOfficialAgent(deps.prisma, actorUserId, 'admin_sync_official_kb', null, {
    agentId,
    agentKey,
    versionId: versionId ?? null,
    documentCount: synced.length,
    documentIds: synced.map((row) => row.documentId),
    statuses: synced.map((row) => row.status),
  });
}
