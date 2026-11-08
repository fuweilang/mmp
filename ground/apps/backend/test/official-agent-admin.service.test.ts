import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OfficialAgentGrantStatus, OfficialAgentStatus, User } from '@prisma/client';
import { AdminOfficialAgentsService } from '../src/admin/admin-official-agents.service';

const actor = { id: 'admin-1' } as User;

function createHarness() {
  const agent = {
    id: 'agent-1',
    key: 'copy-polish',
    kind: 'GENERAL',
    category: null as string | null,
    capabilities: [] as string[],
    status: OfficialAgentStatus.DRAFT,
    name: '文案润色大师',
    summary: '初始简介',
    openingQuestions: ['帮我润色'],
    systemPrompt: '保留事实',
    toolScope: [] as string[],
    onlineVersionId: null as string | null,
    createdAt: new Date('2026-11-05T08:00:00Z'),
    updatedAt: new Date('2026-11-05T08:00:00Z'),
  };
  const versions: Array<Record<string, unknown>> = [];
  const grants: Array<Record<string, unknown>> = [];
  const audit: Array<Record<string, unknown>> = [];
  const tenant = {
    id: 'tenant-1',
    name: '试点企业',
    slug: 'pilot',
    type: 'ENTERPRISE',
    status: 'active',
  };

  function versionView(version: Record<string, unknown>) {
    return { ...version };
  }

  function agentView() {
    return {
      ...agent,
      onlineVersion: versions.find((version) => version.id === agent.onlineVersionId) ?? null,
      versions: [...versions].sort((a, b) => Number(b.version) - Number(a.version)).map(versionView),
      grants: grants.map((grant) => ({
        ...grant,
        tenant,
        version: versions.find((version) => version.id === grant.versionId),
      })),
    };
  }

  const prisma: Record<string, unknown> = {
    officialAgent: {
      findUnique: async () => agentView(),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (typeof data.status === 'string') agent.status = data.status as OfficialAgentStatus;
        if (typeof data.name === 'string') agent.name = data.name;
        if (typeof data.summary === 'string') agent.summary = data.summary;
        if (typeof data.systemPrompt === 'string') agent.systemPrompt = data.systemPrompt;
        const online = data.onlineVersion as { connect?: { id: string } } | undefined;
        if (online?.connect) agent.onlineVersionId = online.connect.id;
        return agentView();
      },
    },
    officialAgentVersion: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id) {
          return versions.find((version) => version.id === where.id && version.agentId === where.agentId) ?? null;
        }
        return [...versions].sort((a, b) => Number(b.version) - Number(a.version))[0] ?? null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const version = {
          ...data,
          id: `version-${versions.length + 1}`,
          publishedAt: new Date(`2026-11-05T09:0${versions.length}:00Z`),
        };
        versions.push(version);
        return version;
      },
    },
    officialAgentTenantGrant: {
      findUnique: async ({ where }: { where: { agentId_tenantId: { tenantId: string } } }) => {
        return grants.find((grant) => grant.tenantId === where.agentId_tenantId.tenantId) ?? null;
      },
      upsert: async ({
        update,
        create,
      }: {
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }) => {
        const existing = grants.find((grant) => grant.tenantId === create.tenantId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const grant = {
          ...create,
          id: `grant-${grants.length + 1}`,
          status: OfficialAgentGrantStatus.ACTIVE,
          revokedAt: null,
          createdAt: new Date('2026-11-05T10:00:00Z'),
          updatedAt: new Date('2026-11-05T10:00:00Z'),
        };
        grants.push(grant);
        return grant;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const grant = grants.find((item) => item.id === where.id);
        assert.ok(grant);
        Object.assign(grant, data);
        return grant;
      },
    },
    tenant: {
      findUnique: async () => tenant,
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audit.push(data);
        return data;
      },
    },
  };
  prisma.$transaction = async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => callback(prisma);

  const service = new AdminOfficialAgentsService(
    prisma as never,
    { adminScope: async () => null } as never,
    { loadAssetFiles: () => [], syncFromAssets: async () => [] } as never,
  );
  return { service, agent, versions, grants, audit };
}

test('发布冻结独立快照，后续草稿和新版本不改变历史版本或企业固定版本', async () => {
  const { service, agent, versions, grants } = createHarness();
  const first = await service.publish(actor, agent.id);
  const firstVersionId = first.onlineVersion.id;
  await service.grant(actor, agent.id, { tenantId: 'tenant-1' });

  agent.name = '修改后的草稿';
  agent.systemPrompt = '新的提示词';
  const second = await service.publish(actor, agent.id);

  assert.equal(versions.length, 2);
  assert.equal(versions[0]?.name, '文案润色大师');
  assert.equal(versions[0]?.systemPrompt, '保留事实');
  assert.equal(versions[1]?.name, '修改后的草稿');
  assert.equal(second.onlineVersion.id, versions[1]?.id);
  assert.equal(grants[0]?.versionId, firstVersionId);
});

test('企业开通默认固定线上版本，并允许显式升级、回滚和拒绝外智能体版本', async () => {
  const { service, agent, grants } = createHarness();
  await service.publish(actor, agent.id);
  await service.grant(actor, agent.id, { tenantId: 'tenant-1' });
  assert.equal(grants[0]?.versionId, 'version-1');

  await service.publish(actor, agent.id);
  await service.grant(actor, agent.id, { tenantId: 'tenant-1', versionId: 'version-2' });
  assert.equal(grants[0]?.versionId, 'version-2');

  await service.grant(actor, agent.id, { tenantId: 'tenant-1', versionId: 'version-1' });
  assert.equal(grants[0]?.versionId, 'version-1');
  await assert.rejects(
    service.grant(actor, agent.id, { tenantId: 'tenant-1', versionId: 'other-agent-version' }),
    /所选版本不属于该智能体/,
  );
});

test('下架阻止新开通，撤销保留授权记录并写入审计', async () => {
  const { service, agent, grants, audit } = createHarness();
  await service.publish(actor, agent.id);
  await service.grant(actor, agent.id, { tenantId: 'tenant-1' });
  await service.offline(actor, agent.id);

  assert.equal(agent.status, OfficialAgentStatus.OFFLINE);
  await assert.rejects(
    service.grant(actor, agent.id, { tenantId: 'tenant-1' }),
    /请先发布智能体/,
  );
  await service.revoke(actor, agent.id, 'tenant-1');
  assert.equal(grants.length, 1);
  assert.equal(grants[0]?.status, OfficialAgentGrantStatus.REVOKED);
  assert.ok(grants[0]?.revokedAt instanceof Date);
  assert.deepEqual(audit.map((entry) => entry.action), [
    'admin_publish_official_agent',
    'admin_grant_official_agent',
    'admin_offline_official_agent',
    'admin_revoke_official_agent',
  ]);
});
