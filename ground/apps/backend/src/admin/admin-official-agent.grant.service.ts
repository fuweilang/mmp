import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  OfficialAgentGrantStatus,
  OfficialAgentStatus,
  TenantType,
  User,
} from '@prisma/client';
import { assertSuperAdmin } from '../auth/super-admin';
import { GrantOfficialAgentDto } from './dto/official-agent.dto';
import {
  AdminOfficialAgentDeps,
  AdminOfficialAgentPresenter,
  auditOfficialAgent,
  requireAgentRow,
} from './admin-official-agent.presenter';

/**
 * 企业授权与配额簇（审计 P1-2 C 簇）。
 *
 * `bulkGrant` / `bulkRevoke` 是**逐企业串行、无整体事务、部分成功**语义：
 * 单个企业失败只进 results，不中断后续企业，也不回滚已写入的授权；
 * 末尾统一写一条 bulk 审计与 summary 计数。拆分时逐行保留，禁止补事务。
 */
export class AdminOfficialAgentGrantService {
  constructor(
    private readonly deps: () => AdminOfficialAgentDeps,
    private readonly presenter: AdminOfficialAgentPresenter,
  ) {}

  async grant(actor: User, id: string, dto: GrantOfficialAgentDto) {
    const { prisma } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
    const agent = await requireAgentRow(prisma, id);
    if (agent.status !== OfficialAgentStatus.PUBLISHED || !agent.onlineVersionId) {
      throw new BadRequestException('请先发布专家，再开通企业');
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant || tenant.type !== TenantType.ENTERPRISE) {
      throw new NotFoundException('试点企业不存在');
    }
    if (tenant.status !== 'active') throw new BadRequestException('停用企业不能开通专家');

    const versionId = dto.versionId ?? agent.onlineVersionId;
    const version = await prisma.officialAgentVersion.findFirst({
      where: { id: versionId, agentId: id },
      select: { id: true, version: true },
    });
    if (!version) throw new BadRequestException('所选版本不属于该专家');

    const previous = await prisma.officialAgentTenantGrant.findUnique({
      where: { agentId_tenantId: { agentId: id, tenantId: dto.tenantId } },
    });
    await prisma.officialAgentTenantGrant.upsert({
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
    await auditOfficialAgent(prisma, actor.id, 'admin_grant_official_agent', dto.tenantId, {
      agentId: id,
      previousVersionId: previous?.versionId ?? null,
      versionId,
      version: version.version,
      reactivated: previous?.status === OfficialAgentGrantStatus.REVOKED,
    });
    return this.presenter.load(id);
  }

  async revoke(actor: User, id: string, tenantId: string) {
    const { prisma } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
    await requireAgentRow(prisma, id);
    const grant = await prisma.officialAgentTenantGrant.findUnique({
      where: { agentId_tenantId: { agentId: id, tenantId } },
    });
    if (!grant || grant.status === OfficialAgentGrantStatus.REVOKED) {
      throw new BadRequestException('该企业尚未开通此专家');
    }
    await prisma.officialAgentTenantGrant.update({
      where: { id: grant.id },
      data: { status: OfficialAgentGrantStatus.REVOKED, revokedAt: new Date() },
    });
    await auditOfficialAgent(prisma, actor.id, 'admin_revoke_official_agent', tenantId, {
      agentId: id,
      versionId: grant.versionId,
    });
    return this.presenter.load(id);
  }

  async bulkGrant(actor: User, id: string, tenantIds: string[], versionId?: string) {
    const { prisma } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
    const agent = await requireAgentRow(prisma, id);
    if (agent.status !== OfficialAgentStatus.PUBLISHED || !agent.onlineVersionId) {
      throw new BadRequestException('请先发布专家，再开通企业');
    }
    const uniqueTenantIds = [...new Set(tenantIds.map((value) => value.trim()).filter(Boolean))];
    if (!uniqueTenantIds.length) throw new BadRequestException('请选择要开通的企业');
    const targetVersionId = versionId ?? agent.onlineVersionId;
    const version = await prisma.officialAgentVersion.findFirst({
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
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant || tenant.type !== TenantType.ENTERPRISE) {
        results.push({ tenantId, action: 'error', reason: '试点企业不存在' });
        continue;
      }
      if (tenant.status !== 'active') {
        results.push({ tenantId, action: 'error', reason: '停用企业不能开通专家' });
        continue;
      }
      const previous = await prisma.officialAgentTenantGrant.findUnique({
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
      await prisma.officialAgentTenantGrant.upsert({
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
      await auditOfficialAgent(prisma, actor.id, 'admin_grant_official_agent', tenantId, {
        agentId: id,
        previousVersionId: previous?.versionId ?? null,
        versionId: targetVersionId,
        version: version.version,
        reactivated: previous?.status === OfficialAgentGrantStatus.REVOKED,
        bulk: true,
      });
      results.push({ tenantId, action, versionId: targetVersionId });
    }

    await auditOfficialAgent(prisma, actor.id, 'admin_bulk_grant_official_agent', null, {
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
      agent: await this.presenter.load(id),
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
    const { prisma } = this.deps();
    await assertSuperAdmin(prisma, actor.id);
    await requireAgentRow(prisma, id);
    const uniqueTenantIds = [...new Set(tenantIds.map((value) => value.trim()).filter(Boolean))];
    if (!uniqueTenantIds.length) throw new BadRequestException('请选择要撤销的企业');
    const results: Array<{
      tenantId: string;
      action: 'revoked' | 'skipped' | 'error';
      reason?: string;
      versionId?: string | null;
    }> = [];
    for (const tenantId of uniqueTenantIds) {
      const grant = await prisma.officialAgentTenantGrant.findUnique({
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
      await prisma.officialAgentTenantGrant.update({
        where: { id: grant.id },
        data: { status: OfficialAgentGrantStatus.REVOKED, revokedAt: new Date() },
      });
      await auditOfficialAgent(prisma, actor.id, 'admin_revoke_official_agent', tenantId, {
        agentId: id,
        versionId: grant.versionId,
        bulk: true,
      });
      results.push({ tenantId, action: 'revoked', versionId: grant.versionId });
    }
    await auditOfficialAgent(prisma, actor.id, 'admin_bulk_revoke_official_agent', null, {
      agentId: id,
      requestedCount: uniqueTenantIds.length,
      revoked: results.filter((row) => row.action === 'revoked').length,
      skipped: results.filter((row) => row.action === 'skipped').length,
      errors: results.filter((row) => row.action === 'error').length,
      tenantIds: results.filter((row) => row.action === 'revoked').map((row) => row.tenantId),
    });
    return {
      agent: await this.presenter.load(id),
      results,
      summary: {
        revoked: results.filter((row) => row.action === 'revoked').length,
        skipped: results.filter((row) => row.action === 'skipped').length,
        errors: results.filter((row) => row.action === 'error').length,
      },
    };
  }
}
