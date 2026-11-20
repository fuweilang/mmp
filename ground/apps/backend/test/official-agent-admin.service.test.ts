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
    customAvatarPath: null as string | null,
    onlineVersionId: null as string | null,
    createdAt: new Date('2026-11-05T08:00:00Z'),
    updatedAt: new Date('2026-11-05T08:00:00Z'),
  };
  const versions: Array<Record<string, unknown>> = [];
  const grants: Array<Record<string, unknown>> = [];
  const audit: Array<Record<string, unknown>> = [];
  const links: Array<{ agentId: string; skillId: string }> = [];
  const skills = new Map([
    ['skill-1', { id: 'skill-1', key: 'skill-1', name: '技能一', summary: '', categories: [], enabledAt: new Date(), currentRevision: 1, customAvatarPath: null }],
    ['skill-2', { id: 'skill-2', key: 'skill-2', name: '技能二', summary: '', categories: [], enabledAt: new Date(), currentRevision: 1, customAvatarPath: null }],
  ]);
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
      skillLinks: links.map((link) => ({ ...link, skill: skills.get(link.skillId)! })),
    };
  }

  const prisma: Record<string, unknown> = {
    officialAgent: {
      findUnique: async () => agentView(),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (typeof data.status === 'string') agent.status = data.status as OfficialAgentStatus;
        if (typeof data.name === 'string') agent.name = data.name;
        if (typeof data.kind === 'string') agent.kind = data.kind as typeof agent.kind;
        if ('category' in data) agent.category = data.category as string | null;
        if (Array.isArray(data.capabilities)) agent.capabilities = data.capabilities as string[];
        if (typeof data.summary === 'string') agent.summary = data.summary;
        if (typeof data.systemPrompt === 'string') agent.systemPrompt = data.systemPrompt;
        if(data.executionConfig)agent.executionConfig=data.executionConfig as Record<string,unknown>;
        if (Array.isArray(data.openingQuestions)) agent.openingQuestions = data.openingQuestions as string[];
        if (Array.isArray(data.toolScope)) agent.toolScope = data.toolScope as string[];
        if (data.expertDefinition && typeof data.expertDefinition === 'object') {
          (agent as { expertDefinition: Record<string, unknown> }).expertDefinition =
            data.expertDefinition as Record<string, unknown>;
        }
        if (typeof data.customAvatarPath === 'string' || data.customAvatarPath === null) {
          agent.customAvatarPath = data.customAvatarPath as string | null;
        }
        if (typeof data.onlineVersionId === 'string') agent.onlineVersionId = data.onlineVersionId;
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
    officialSkill: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.filter((id) => skills.has(id)).map((id) => skills.get(id)!),
    },
    officialAgentSkillLink: {
      deleteMany: async ({ where }: { where: { agentId: string } }) => {
        for (let i = links.length - 1; i >= 0; i -= 1) {
          if (links[i]!.agentId === where.agentId) links.splice(i, 1);
        }
        return { count: 1 };
      },
      createMany: async ({ data }: { data: Array<{ agentId: string; skillId: string }> }) => {
        links.push(...data);
        return { count: data.length };
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
  return { service, agent, versions, grants, audit, links };
}

function versionSetup(versions: Array<Record<string, unknown>>, agentId: string) {
  versions.push({
    id: 'version-old',
    agentId,
    version: 3,
    name: '旧名称',
    summary: '旧简介',
    openingQuestions: ['旧问题'],
    systemPrompt: '旧指令',
    toolScope: ['web_search'],
    category: 'content',
    capabilities: ['旧标签'],
    kind: 'KNOWLEDGE',
    customAvatarPath: 'official-avatars/old.jpg',
    expertDefinition: { profile: { role: '旧角色' } },
    executionConfig: { route: 'LEGACY' },
    linkedSkillSummaries: [{ id: 'skill-1' }, { id: 'missing-skill' }],
    publishedByUserId: null,
    publishedAt: new Date('2026-11-01T00:00:00Z'),
  });
}

test('已创建的专家可以修改类型并落库', async () => {
  const { service, agent } = createHarness();
  const updated = await service.update(actor, agent.id, { kind: 'KNOWLEDGE' });
  assert.equal(updated.kind, 'KNOWLEDGE');
  assert.equal((await service.detail(actor, agent.id)).kind, 'KNOWLEDGE');
});

test('发布冻结独立快照，后续草稿和新版本不改变历史版本或企业固定版本', async () => {
  const { service, agent, versions, grants } = createHarness();
  const first = await service.publish(actor, agent.id);
  assert.ok(first.onlineVersion);
  const firstVersionId = first.onlineVersion.id;
  await service.grant(actor, agent.id, { tenantId: 'tenant-1' });

  agent.name = '修改后的草稿';
  agent.systemPrompt = '新的提示词';
  agent.category = 'content';
  agent.capabilities = ['新标签'];
  agent.kind = 'KNOWLEDGE';
  const second = await service.publish(actor, agent.id);

  assert.equal(first.versions[0]?.category, null);
  assert.deepEqual(first.versions[0]?.capabilities, []);
  assert.equal(first.versions[0]?.kind, 'GENERAL');
  assert.equal(second.versions[0]?.category, 'content');
  assert.deepEqual(second.versions[0]?.capabilities, ['新标签']);
  assert.equal(second.versions[0]?.kind, 'KNOWLEDGE');
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

test('回滚同时把所选版本的冻结内容恢复到草稿，并重建关联技能', async () => {
  const { service, agent, versions, audit, links } = createHarness();
  versionSetup(versions, agent.id);
  agent.name = '新名称';
  agent.summary = '新简介';
  agent.systemPrompt = '新指令';
  agent.openingQuestions = ['新问题'];
  agent.toolScope = ['terminal'];
  agent.category = 'sales';
  agent.capabilities = ['新标签'];
  agent.kind = 'GENERAL';
  agent.customAvatarPath = 'official-avatars/new.jpg';
  agent.expertDefinition = { profile: { role: '新角色' } };
  agent.executionConfig = { route: 'KNOWLEDGE_CORE' };
  links.push({ agentId: agent.id, skillId: 'skill-2' });

  const restored = await service.rollback(actor, agent.id, 'version-old');

  assert.equal(restored.onlineVersion?.id, 'version-old');
  assert.equal(agent.status, OfficialAgentStatus.PUBLISHED);
  assert.equal(agent.onlineVersionId, 'version-old');
  assert.equal(agent.name, '旧名称');
  assert.equal(agent.summary, '旧简介');
  assert.equal(agent.systemPrompt, '旧指令');
  assert.deepEqual(agent.openingQuestions, ['旧问题']);
  assert.deepEqual(agent.toolScope, ['web_search']);
  assert.equal(agent.category, 'content');
  assert.deepEqual(agent.capabilities, ['旧标签']);
  assert.equal(agent.kind, 'KNOWLEDGE');
  assert.equal(agent.customAvatarPath, 'official-avatars/old.jpg');
  assert.deepEqual(agent.expertDefinition, { profile: { role: '旧角色' } });
  assert.deepEqual(agent.executionConfig, { route: 'LEGACY' });
  assert.deepEqual(links, [{ agentId: agent.id, skillId: 'skill-1' }]);
  assert.equal(restored.draft.name, '旧名称');
  assert.equal(restored.draft.systemPrompt, '旧指令');
  assert.equal(restored.category, 'content');
  assert.deepEqual(restored.capabilities, ['旧标签']);
  assert.equal(restored.kind, 'KNOWLEDGE');
  assert.ok(audit.some((row) => {
    const meta = row.meta as Record<string, unknown>;
    return row.action === 'admin_rollback_official_agent' && meta.draftRestored === true
      && Array.isArray(meta.missingLinkedSkillIds) && (meta.missingLinkedSkillIds as string[]).includes('missing-skill');
  }));
});

test('历史版本没有分类快照时保留当前分类和标签', async () => {
  const { service, agent, versions, audit } = createHarness();
  versions.push({
    id: 'version-legacy',
    agentId: agent.id,
    version: 1,
    name: '历史名称',
    summary: '',
    openingQuestions: [],
    systemPrompt: '',
    toolScope: [],
    category: null,
    capabilities: null,
    kind: null,
    customAvatarPath: null,
    expertDefinition: {},
    executionConfig: { route: 'LEGACY' },
    linkedSkillSummaries: [],
    publishedByUserId: null,
    publishedAt: new Date('2026-11-01T00:00:00Z'),
  });
  agent.category = 'content';
  agent.capabilities = ['保留标签'];
  agent.kind = 'GENERAL';

  await service.rollback(actor, agent.id, 'version-legacy');

  assert.equal(agent.category, 'content');
  assert.deepEqual(agent.capabilities, ['保留标签']);
  assert.equal(agent.kind, 'GENERAL');
  assert.ok(audit.some((row) => {
    const meta = row.meta as Record<string, unknown>;
    return row.action === 'admin_rollback_official_agent' && meta.classificationRestored === false;
  }));
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
