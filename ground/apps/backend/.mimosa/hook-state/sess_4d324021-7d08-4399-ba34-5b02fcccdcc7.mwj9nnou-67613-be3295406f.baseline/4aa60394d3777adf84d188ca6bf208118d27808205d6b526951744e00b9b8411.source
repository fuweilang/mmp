import { ExpertRuntimeService } from '../src/official-agent/expert-runtime.service';
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
    status: OfficialAgentStatus.DRAFT as OfficialAgentStatus,
    name: '文案润色大师',
    summary: '初始简介',
    openingQuestions: ['帮我润色'],
    systemPrompt: '保留事实',
    toolScope: [] as string[],
    expertDefinition: {} as Record<string, unknown>,
    executionConfig: {route:'LEGACY'} as Record<string,unknown>,
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
      skillLinks: [],
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
        if(data.executionConfig)agent.executionConfig=data.executionConfig as Record<string,unknown>;
        if (Array.isArray(data.openingQuestions)) agent.openingQuestions = data.openingQuestions as string[];
        if (Array.isArray(data.toolScope)) agent.toolScope = data.toolScope as string[];
        if (data.expertDefinition && typeof data.expertDefinition === 'object') {
          (agent as { expertDefinition: Record<string, unknown> }).expertDefinition =
            data.expertDefinition as Record<string, unknown>;
        }
        const online = data.onlineVersion as { connect?: { id: string } } | undefined;
        if (online?.connect) agent.onlineVersionId = online.connect.id;
        agent.updatedAt = new Date();
        return agentView();
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (typeof data.status === 'string') agent.status = data.status as OfficialAgentStatus;
        if (Array.isArray(data.openingQuestions)) agent.openingQuestions = data.openingQuestions as string[];
        if (data.expertDefinition && typeof data.expertDefinition === 'object') {
          (agent as { expertDefinition: Record<string, unknown> }).expertDefinition =
            data.expertDefinition as Record<string, unknown>;
        }
        agent.updatedAt = new Date();
        return { count: 1 };
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
          linkedSkillSummaries: [],
          expertDefinition: {},
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
    userRole: {findFirst: async()=>({roleId:"super"})},
    user: {findUnique: async()=>({status:"active"}),
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in
          .filter((id) => id === actor.id)
          .map((id) => ({ id, name: '平台管理员' })),
    },
  };
  prisma.$transaction = async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => callback(prisma);

  const service = new AdminOfficialAgentsService(
    prisma as never,
    { adminScope: async () => null } as never,
    { loadAssetFiles: () => [], syncFromAssets: async () => [] } as never,
    { setAgentSkillLinks: async () => undefined, snapshotLinkedSkills: async () => [] } as never,
    new ExpertRuntimeService(prisma as never, {} as never),
  );
  return { service, agent, versions, grants, audit };
}

test('发布冻结独立快照，后续草稿和新版本不改变历史版本或企业固定版本', async () => {
  const { service, agent, versions, grants } = createHarness();
  const first = await service.publish(actor, agent.id);
  assert.ok(first.onlineVersion);
  const firstVersionId = first.onlineVersion.id;
  await service.grant(actor, agent.id, { tenantId: 'tenant-1' });

  agent.name = '修改后的草稿';
  agent.systemPrompt = '新的提示词';
  const second = await service.publish(actor, agent.id);

  assert.equal(versions.length, 2);
  assert.equal(versions[0]?.name, '文案润色大师');
  assert.equal(versions[0]?.systemPrompt, '保留事实');
  assert.equal(versions[1]?.name, '修改后的草稿');
  assert.ok(second.onlineVersion);
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
    /所选版本不属于该专家/,
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
    /请先发布专家/,
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


test('已发布后保存只改待发布配置，标记有未发布修改；再发布生成新版本且操作人真实', async () => {
  const { service, agent, versions } = createHarness();
  const first = await service.publish(actor, agent.id);
  assert.equal(first.hasUnpublishedChanges, false);
  assert.ok(first.onlineVersion);
  assert.equal(first.versions[0]?.publishedByUserId, actor.id);
  assert.equal(first.versions[0]?.publishedByName, '平台管理员');

  await service.update(actor, agent.id, { name: '新的待发布名', systemPrompt: '新提示词' });
  const pending = await service.detail(actor, agent.id);
  assert.equal(pending.status, OfficialAgentStatus.PUBLISHED);
  assert.equal(pending.hasUnpublishedChanges, true);
  assert.equal(pending.draft.name, '新的待发布名');
  assert.equal(pending.onlineVersion?.name, '文案润色大师');
  assert.equal(versions.length, 1);

  const second = await service.publish(actor, agent.id);
  assert.equal(versions.length, 2);
  assert.equal(second.hasUnpublishedChanges, false);
  assert.equal(second.onlineVersion?.name, '新的待发布名');
  assert.equal(second.versions[0]?.version, 2);
  assert.equal(second.versions[0]?.publishedByName, '平台管理员');
});

test('下架后不可再视为已发布；仍可编辑并重新发布，版本继续递增', async () => {
  const { service, agent, versions } = createHarness();
  await service.publish(actor, agent.id);
  const offlined = await service.offline(actor, agent.id);
  assert.equal(offlined.status, OfficialAgentStatus.OFFLINE);
  assert.equal(versions.length, 1);

  await service.update(actor, agent.id, { summary: '下架后修改' });
  const again = await service.publish(actor, agent.id);
  assert.equal(again.status, OfficialAgentStatus.PUBLISHED);
  assert.equal(versions.length, 2);
  assert.equal(again.onlineVersion?.version, 2);
  assert.equal(again.draft.summary, '下架后修改');
});


test('广场介绍保存同步示例问题到 openingQuestions，清空后不再被旧问题回退', async () => {
  const { service, agent, versions } = createHarness();
  await service.publish(actor, agent.id);
  const beforeVersions = versions.length;
  const stamp = agent.updatedAt.toISOString();
  await service.saveDiscovery(actor, agent.id, {
    expectedUpdatedAt: stamp,
    discoveryDetail: {
      schemaVersion: 1,
      displayRevision: 0,
      introduction: '适合需要周报的人',
      outputs: ['周报初稿'],
      materials: [],
      boundaries: ['不适合法律意见'],
      starters: [{ label: '写周报', text: '帮我写一份本周工作周报' }],
    },
  });
  assert.deepEqual(agent.openingQuestions, ['帮我写一份本周工作周报']);
  assert.equal(versions.length, beforeVersions, '保存介绍不得新增发布版本');

  const stamp2 = agent.updatedAt.toISOString();
  await service.saveDiscovery(actor, agent.id, {
    expectedUpdatedAt: stamp2,
    discoveryDetail: {
      schemaVersion: 1,
      displayRevision: 1,
      introduction: '适合需要周报的人',
      outputs: ['周报初稿'],
      materials: [],
      boundaries: ['不适合法律意见'],
      starters: [],
    },
  });
  assert.deepEqual(agent.openingQuestions, []);
  const loaded = await service.discovery(actor, agent.id);
  assert.deepEqual(loaded.discoveryDetail.starters, []);
});

test('发布后无实质修改时 hasUnpublishedChanges 为 false；jsonb 键序不同不产生假阳性', async () => {
  const { service, agent, versions } = createHarness();
  const published = await service.publish(actor, agent.id);
  assert.equal(published.hasUnpublishedChanges, false);

  // Simulate Postgres jsonb returning the same semantic payload with shuffled keys only.
  const online = versions[0] as Record<string, unknown>;
  const current = online.expertDefinition as Record<string, unknown>;
  online.expertDefinition = {
    extensions: current.extensions ?? {},
    dependencies: current.dependencies ?? [],
    deliverables: current.deliverables ?? [],
    adaptation: current.adaptation ?? {},
    workflow: current.workflow ?? [],
    profile: current.profile,
    license: current.license ?? {},
    source: current.source ?? {},
    schemaVersion: current.schemaVersion ?? 1,
    ...(current.discoveryDetail !== undefined
      ? { discoveryDetail: current.discoveryDetail }
      : {}),
  };
  const again = await service.detail(actor, agent.id);
  assert.equal(again.hasUnpublishedChanges, false, '键序不同不应标记未发布修改');
});

test('广场介绍或主配置相对线上有真实差异时 hasUnpublishedChanges 为 true', async () => {
  const { service, agent } = createHarness();
  await service.publish(actor, agent.id);
  const stamp = agent.updatedAt.toISOString();
  await service.saveDiscovery(actor, agent.id, {
    expectedUpdatedAt: stamp,
    discoveryDetail: {
      schemaVersion: 1,
      displayRevision: 0,
      introduction: '新的广场介绍',
      outputs: ['交付物A'],
      materials: [],
      boundaries: [],
      starters: [{ label: '示例', text: '帮我做一个方案' }],
    },
  });
  const pending = await service.detail(actor, agent.id);
  assert.equal(pending.hasUnpublishedChanges, true);
  assert.equal(pending.onlineVersion?.name, '文案润色大师');
});
test('publishing a built-in key through knowledge-core never resynchronizes the legacy corpus',async()=>{
 const {service,agent}=createHarness();agent.key='gzh';let syncs=0;
 (service as any).officialKb={loadAssetFiles:()=>[],syncFromAssets:async()=>{syncs++;return[];}};
 await service.update(actor,agent.id,{executionConfig:{route:'KNOWLEDGE_CORE',retrievalPolicy:'OFF'}});
 await service.publish(actor,agent.id);
 assert.equal(syncs,0);
 await service.update(actor,agent.id,{executionConfig:{route:'LEGACY'}});
 await service.publish(actor,agent.id);
 assert.equal(syncs,1);
});
