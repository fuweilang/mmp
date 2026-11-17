import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OfficialAgentStatus, Prisma, User } from '@prisma/client';
import { assertSuperAdmin } from '../auth/super-admin';
import { loadOfficialAgentAssets } from '../official-agent/official-agent-assets';
import { normalizeExpertDefinition } from '../official-agent/expert-definition';
import {
  AdminOfficialAgentDeps,
  AdminOfficialAgentPresenter,
  assertPublishable,
  auditOfficialAgent,
  frozenStringList,
  requireAgentRow,
} from './admin-official-agent.presenter';
import { syncOfficialAgentKb } from './admin-official-agent.discovery.service';

/**
 * 发布/下线/回滚/批量下架簇（审计 P1-2 B 簇）。
 * Serializable 事务、P2002/P2034 冲突映射、KB 同步时机均原样保留。
 */
export class AdminOfficialAgentPublishService {
  constructor(
    private readonly deps: () => AdminOfficialAgentDeps,
    private readonly presenter: AdminOfficialAgentPresenter,
  ) {}

  async publish(actor: User, id: string) {
    const { prisma, officialSkills, runtime } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
    try {
      await prisma.$transaction(async (tx) => {
        const agent = await tx.officialAgent.findUnique({
          where: { id },
          include: { skillLinks: true },
        });
        if (!agent) throw new NotFoundException('官方专家不存在');
        assertPublishable(agent);
        const linkedSkillSummaries = await officialSkills.snapshotLinkedSkills(id, tx);
        if(linkedSkillSummaries.length!==agent.skillLinks.length)throw new BadRequestException('SKILL_DEPENDENCY_DISABLED');
        const executionConfig = await runtime!.freeze(agent.executionConfig, frozenStringList(agent.toolScope, "工具范围"), linkedSkillSummaries, tx);
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
            openingQuestions: frozenStringList(agent.openingQuestions, '开场问题'),
            systemPrompt: agent.systemPrompt,
            toolScope: frozenStringList(agent.toolScope, '工具范围'),
            customAvatarPath: agent.customAvatarPath || null,
            linkedSkillSummaries: linkedSkillSummaries as unknown as Prisma.InputJsonValue,
            expertDefinition: normalizeExpertDefinition(agent.expertDefinition, agent),
            executionConfig: executionConfig as unknown as Prisma.InputJsonValue,
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
    const published = await this.presenter.load(id);
    const asset = loadOfficialAgentAssets([published.key])[0];
    if (asset?.kbFiles?.length && (published.onlineVersion?.executionConfig as {route?:string})?.route !== 'KNOWLEDGE_CORE') {
      await syncOfficialAgentKb(
        this.deps(),
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
    const { prisma } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
    const agent = await requireAgentRow(prisma, id);
    if (agent.status !== OfficialAgentStatus.PUBLISHED) {
      throw new BadRequestException('只有已发布的专家可以下架');
    }
    await prisma.officialAgent.update({
      where: { id },
      data: { status: OfficialAgentStatus.OFFLINE },
    });
    await auditOfficialAgent(prisma, actor.id, 'admin_offline_official_agent', null, {
      agentId: id,
      versionId: agent.onlineVersionId,
    });
    return this.presenter.load(id);
  }

  async rollback(actor:User,id:string,versionId:string){
    const { prisma } = this.deps();
    await assertSuperAdmin(prisma,actor.id);
    await prisma.$transaction(async tx=>{
      const version=await tx.officialAgentVersion.findFirst({where:{id:versionId,agentId:id}});
      if(!version)throw new NotFoundException('专家版本不存在');
      await tx.officialAgent.update({where:{id},data:{status:'PUBLISHED',onlineVersionId:versionId}});
      await tx.auditLog.create({data:{userId:actor.id,action:'admin_rollback_official_agent',meta:{agentId:id,versionId}}});
    });
    return this.presenter.load(id);
  }

  async bulkOffline(actor: User, ids: string[]) {
    const { prisma } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (!uniqueIds.length) throw new BadRequestException('请选择要下架的专家');
    const results: Array<{
      id: string;
      key?: string;
      action: 'offlined' | 'skipped' | 'error';
      reason?: string;
    }> = [];
    for (const id of uniqueIds) {
      const agent = await prisma.officialAgent.findUnique({ where: { id } });
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
      await prisma.officialAgent.update({
        where: { id },
        data: { status: OfficialAgentStatus.OFFLINE },
      });
      await auditOfficialAgent(prisma, actor.id, 'admin_offline_official_agent', null, {
        agentId: id,
        key: agent.key,
        versionId: agent.onlineVersionId,
        bulk: true,
      });
      results.push({ id, key: agent.key, action: 'offlined' });
    }
    await auditOfficialAgent(prisma, actor.id, 'admin_bulk_offline_official_agent', null, {
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
}
