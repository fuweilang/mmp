import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OfficialAgentGrantStatus, OfficialAgentStatus } from '@prisma/client';
import { AdminOfficialAgentsService } from '../src/admin/admin-official-agents.service';

/**
 * P1-2 拆分护栏：bulkGrant 必须是「逐企业串行、部分成功、整体不回滚」。
 * 审计断言点（删掉任一即失败）：
 * 1. 无效/停用企业只记 error，不中断后续企业；
 * 2. 已开通且版本未变的记 skipped，且不重复写 upsert；
 * 3. 成功企业的 upsert 在失败企业之后仍然落库（无整体事务回滚）；
 * 4. summary 与 results 计数一致，末尾写一条 bulk 审计。
 */
function createBulkGrantHarness() {
  const actor = { id: 'admin-bulk-1' } as never;
  const tenants: Record<string, { id: string; name: string; type: string; status: string }> = {
    't-ok': { id: 't-ok', name: '可用企业', type: 'ENTERPRISE', status: 'active' },
    't-off': { id: 't-off', name: '停用企业', type: 'ENTERPRISE', status: 'disabled' },
    't-platform': { id: 't-platform', name: '平台', type: 'PLATFORM', status: 'active' },
    't-skip': { id: 't-skip', name: '已开通企业', type: 'ENTERPRISE', status: 'active' },
    't-revoke': { id: 't-revoke', name: '已撤销企业', type: 'ENTERPRISE', status: 'active' },
    't-upgrade': { id: 't-upgrade', name: '旧版本企业', type: 'ENTERPRISE', status: 'active' },
  };
  const agent = {
    id: 'agent-1',
    key: 'copy-polish',
    kind: 'GENERAL',
    status: OfficialAgentStatus.PUBLISHED,
    name: '文案润色大师',
    summary: '润色',
    openingQuestions: [] as string[],
    systemPrompt: '指令',
    toolScope: [] as string[],
    expertDefinition: { schemaVersion: 1, profile: { role: '编辑' } } as Record<string, unknown>,
    executionConfig: { route: 'LEGACY' } as Record<string, unknown>,
    category: null,
    capabilities: [] as string[],
    onlineVersionId: 'ver-1',
    customAvatarPath: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    onlineVersion: null as unknown,
    versions: [] as Array<Record<string, unknown>>,
    grants: [] as Array<Record<string, unknown>>,
    skillLinks: [] as Array<Record<string, unknown>>,
  };
  const grants: Array<Record<string, unknown>> = [
    {
      id: 'grant-skip',
      agentId: 'agent-1',
      tenantId: 't-skip',
      versionId: 'ver-1',
      status: OfficialAgentGrantStatus.ACTIVE,
      grantedByUserId: 'admin-bulk-1',
      revokedAt: null,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-01T00:00:00Z'),
    },
  ];
  const upserts: string[] = [];
  const audit: Array<Record<string, unknown>> = [];
  const version = { id: 'ver-1', agentId: 'agent-1', version: 1 };

  const prisma = {
    user: {
      findUnique: async () => ({ status: 'active' }),
      findMany: async () => [],
    },
    userRole: { findFirst: async () => ({ roleId: 'super' }) },
    tenant: {
      findUnique: async ({ where }: { where: { id: string } }) => tenants[where.id] ?? null,
    },
    officialAgent: {
      findUnique: async () => agent,
    },
    officialAgentVersion: {
      findFirst: async ({ where }: { where: { id: string; agentId: string } }) =>
        where.id === version.id && where.agentId === version.agentId ? version : null,
    },
    officialAgentTenantGrant: {
      findUnique: async ({ where }: { where: { agentId_tenantId: { agentId: string; tenantId: string } } }) =>
        grants.find(
          (grant) =>
            grant.agentId === where.agentId_tenantId.agentId &&
            grant.tenantId === where.agentId_tenantId.tenantId,
        ) ?? null,
      upsert: async ({ where, update, create }: {
        where: { agentId_tenantId: { agentId: string; tenantId: string } };
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }) => {
        const { agentId, tenantId } = where.agentId_tenantId;
        upserts.push(tenantId);
        const existing = grants.find((grant) => grant.agentId === agentId && grant.tenantId === tenantId);
        if (existing) {
          // 新对象写回，保持调用方手里的 previous 快照不被原地改写（与 Prisma 返回行为一致）。
          grants[grants.indexOf(existing)] = { ...existing, ...update };
          return grants[grants.indexOf(existing)];
        }
        const created = { id: `grant-${tenantId}`, ...create };
        grants.push(created);
        return created;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audit.push(data);
        return data;
      },
    },
  };

  const service = new AdminOfficialAgentsService(
    prisma as never,
    { adminScope: async () => null } as never,
    {} as never,
    {} as never,
    undefined,
  );
  return { service, actor, agent, grants, upserts, audit };
}

describe('admin official agent bulk grant partial success', () => {
  it('单企业失败不中断后续企业，且不回滚已成功的授权', async () => {
    const { service, actor, upserts, audit } = createBulkGrantHarness();
    const outcome = await service.bulkGrant(actor, 'agent-1', [
      't-missing',
      't-platform',
      't-off',
      't-skip',
      't-ok',
    ]);

    assert.deepEqual(
      outcome.results.map((row) => [row.tenantId, row.action]),
      [
        ['t-missing', 'error'],
        ['t-platform', 'error'],
        ['t-off', 'error'],
        ['t-skip', 'skipped'],
        ['t-ok', 'granted'],
      ],
      '每个企业的结果必须逐条返回，失败不吞掉后续企业',
    );

    // 失败的 3 家没有写库；跳过的不重复写；最后的可用企业仍写入（无整体事务）。
    assert.deepEqual(upserts, ['t-ok']);
    assert.deepEqual(outcome.summary, {
      granted: 1,
      reactivated: 0,
      upgraded: 0,
      skipped: 1,
      errors: 3,
    });
    assert.equal(outcome.results[0]?.reason, '试点企业不存在');
    assert.equal(outcome.results[1]?.reason, '试点企业不存在');
    assert.equal(outcome.results[2]?.reason, '停用企业不能开通专家');
    assert.equal(outcome.results[3]?.reason, '已开通且版本未变');

    const bulkAudit = audit.filter((row) => row.action === 'admin_bulk_grant_official_agent');
    assert.equal(bulkAudit.length, 1, '末尾只写一条 bulk 审计');
    assert.deepEqual(bulkAudit[0]?.meta, {
      agentId: 'agent-1',
      versionId: 'ver-1',
      version: 1,
      requestedCount: 5,
      granted: 1,
      reactivated: 0,
      upgraded: 0,
      skipped: 1,
      errors: 3,
      tenantIds: ['t-ok'],
    });
    // 只有成功企业写单条 grant 审计，失败/跳过不写。
    const grantAudits = audit.filter((row) => row.action === 'admin_grant_official_agent');
    assert.equal(grantAudits.length, 1);
    assert.equal(grantAudits[0]?.tenantId, 't-ok');
  });

  it('已撤销企业重新开通记 reactivated，已开通旧版本记 upgraded', async () => {
    const { service, actor, grants, upserts } = createBulkGrantHarness();
    grants.push(
      {
        id: 'grant-revoked',
        agentId: 'agent-1',
        tenantId: 't-revoke',
        versionId: 'ver-0',
        status: OfficialAgentGrantStatus.REVOKED,
        grantedByUserId: 'admin-bulk-1',
        revokedAt: new Date('2026-11-02T00:00:00Z'),
      },
      {
        id: 'grant-upgrade',
        agentId: 'agent-1',
        tenantId: 't-upgrade',
        versionId: 'ver-0',
        status: OfficialAgentGrantStatus.ACTIVE,
        grantedByUserId: 'admin-bulk-1',
        revokedAt: null,
      },
    );
    const outcome = await service.bulkGrant(actor, 'agent-1', ['t-revoke', 't-upgrade'], undefined);
    assert.deepEqual(
      outcome.results.map((row) => [row.tenantId, row.action, row.versionId]),
      [
        ['t-revoke', 'reactivated', 'ver-1'],
        ['t-upgrade', 'upgraded', 'ver-1'],
      ],
    );
    assert.deepEqual(upserts, ['t-revoke', 't-upgrade']);
    assert.deepEqual(outcome.summary, {
      granted: 0,
      reactivated: 1,
      upgraded: 1,
      skipped: 0,
      errors: 0,
    });
  });
});
