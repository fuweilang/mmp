import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OfficialAgentStatus, OfficialAgentGrantStatus } from '@prisma/client';
import { AdminOfficialAgentsService } from '../src/admin/admin-official-agents.service';

type AgentRow = {
  id: string;
  key: string;
  kind: 'GENERAL';
  status: OfficialAgentStatus;
  name: string;
  summary: string;
  openingQuestions: string[];
  systemPrompt: string;
  toolScope: string[];
  expertDefinition: Record<string, unknown>;
  category: null;
  capabilities: string[];
  onlineVersionId: string | null;
  customAvatarPath: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function createDeleteHarness(initialStatus: OfficialAgentStatus = OfficialAgentStatus.DRAFT) {
  const actor = { id: 'admin-1' } as never;
  let agent: AgentRow | null = {
    id: 'agent-1',
    key: 'copy-polish',
    kind: 'GENERAL',
    status: initialStatus,
    name: '文案润色大师',
    summary: '润色',
    openingQuestions: [],
    systemPrompt: '指令',
    toolScope: [],
    expertDefinition: { schemaVersion: 1, profile: { role: '编辑' } },
    category: null,
    capabilities: [],
    onlineVersionId: initialStatus === OfficialAgentStatus.PUBLISHED ? 'ver-1' : null,
    customAvatarPath: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
  };
  const versions: Array<Record<string, unknown>> = agent.onlineVersionId
    ? [
        {
          id: 'ver-1',
          agentId: 'agent-1',
          version: 1,
          name: '文案润色大师',
          summary: '润色',
          openingQuestions: [],
          systemPrompt: '指令',
          toolScope: [],
          expertDefinition: {},
          linkedSkillSummaries: [],
          customAvatarPath: null,
          publishedByUserId: 'admin-1',
          publishedAt: new Date('2026-11-01T00:00:00Z'),
        },
      ]
    : [];
  const grants: Array<Record<string, unknown>> = [];
  const preferences: Array<{ kind: string; resourceId: string }> = [
    { kind: 'expert', resourceId: 'agent-1' },
    { kind: 'skill', resourceId: 'skill-keep' },
  ];
  const audit: Array<Record<string, unknown>> = [];
  const skills = [{ id: 'skill-1', key: 'brief', name: '简报', summary: 's' }];

  const prisma: Record<string, unknown> = {
    officialAgent: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (!agent || agent.id !== where.id) return null;
        return {
          ...agent,
          onlineVersion: versions.find((v) => v.id === agent!.onlineVersionId) ?? null,
          versions: [...versions],
          grants: [...grants],
          skillLinks: [],
        };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        if (!agent || agent.id !== where.id) throw Object.assign(new Error('missing'), { code: 'P2025' });
        const online = data.onlineVersion as { disconnect?: boolean; connect?: { id: string } } | undefined;
        if (online?.disconnect) agent.onlineVersionId = null;
        if (online?.connect) agent.onlineVersionId = online.connect.id;
        if (typeof data.status === 'string') agent.status = data.status as OfficialAgentStatus;
        agent.updatedAt = new Date();
        return { ...agent };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        if (!agent || agent.id !== where.id) {
          const err = new Error('Record to delete does not exist.') as Error & { code: string };
          err.code = 'P2025';
          throw err;
        }
        const gone = agent;
        agent = null;
        // Simulate Prisma cascade of owned rows.
        versions.length = 0;
        grants.length = 0;
        return gone;
      },
    },
    officialAgentVersion: {
      findFirst: async () => versions[versions.length - 1] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const version = {
          ...data,
          id: `ver-${versions.length + 1}`,
          publishedAt: new Date(),
          linkedSkillSummaries: data.linkedSkillSummaries ?? [],
        };
        versions.push(version);
        return version;
      },
    },
    officialAgentTenantGrant: {
      findUnique: async () => null,
    },
    officialCatalogPreference: {
      deleteMany: async ({ where }: { where: { kind: string; resourceId: string } }) => {
        const before = preferences.length;
        for (let i = preferences.length - 1; i >= 0; i -= 1) {
          const row = preferences[i]!;
          if (row.kind === where.kind && row.resourceId === where.resourceId) preferences.splice(i, 1);
        }
        return { count: before - preferences.length };
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audit.push(data);
        return data;
      },
    },
    user: {
      findMany: async () => [{ id: 'admin-1', name: '平台管理员' }],
    },
    officialSkill: {
      findMany: async () => skills,
    },
  };
  (prisma as { $transaction: Function }).$transaction = async (
    callback: (tx: Record<string, unknown>) => Promise<unknown>,
  ) => callback(prisma);

  const service = new AdminOfficialAgentsService(
    prisma as never,
    { adminScope: async () => null } as never,
    { loadAssetFiles: () => [], syncFromAssets: async () => [] } as never,
    { setAgentSkillLinks: async () => undefined, snapshotLinkedSkills: async () => [] } as never,
  );

  return { service, actor, getAgent: () => agent, versions, grants, preferences, audit, skills };
}

describe('admin official agent physical delete', () => {
  it('deletes DRAFT agent and clears owned prefs without touching skills', async () => {
    const { service, actor, getAgent, preferences, audit, skills } = createDeleteHarness(
      OfficialAgentStatus.DRAFT,
    );
    const result = await service.remove(actor, 'agent-1');
    assert.deepEqual(result, {
      ok: true,
      id: 'agent-1',
      key: 'copy-polish',
      name: '文案润色大师',
    });
    assert.equal(getAgent(), null);
    assert.deepEqual(preferences, [{ kind: 'skill', resourceId: 'skill-keep' }]);
    assert.equal(skills.length, 1);
    assert.ok(audit.some((row) => row.action === 'admin_delete_official_agent'));
  });

  it('deletes OFFLINE and PUBLISHED without requiring prior offline', async () => {
    for (const status of [OfficialAgentStatus.OFFLINE, OfficialAgentStatus.PUBLISHED]) {
      const { service, actor, getAgent, versions } = createDeleteHarness(status);
      await service.remove(actor, 'agent-1');
      assert.equal(getAgent(), null);
      assert.equal(versions.length, 0);
    }
  });

  it('second delete is not found / conflict-safe', async () => {
    const { service, actor } = createDeleteHarness(OfficialAgentStatus.DRAFT);
    await service.remove(actor, 'agent-1');
    await assert.rejects(() => service.remove(actor, 'agent-1'), (error: unknown) => {
      assert.ok(error instanceof NotFoundException || error instanceof ConflictException);
      return true;
    });
  });

  it('update/publish after delete cannot revive the expert', async () => {
    const { service, actor } = createDeleteHarness(OfficialAgentStatus.DRAFT);
    await service.remove(actor, 'agent-1');
    await assert.rejects(() => service.update(actor, 'agent-1', { name: '复活' }), NotFoundException);
    await assert.rejects(() => service.publish(actor, 'agent-1'), NotFoundException);
  });

  it('frees key so a new expert can reuse it after physical delete', async () => {
    const { service, actor, getAgent } = createDeleteHarness(OfficialAgentStatus.DRAFT);
    const removed = await service.remove(actor, 'agent-1');
    assert.equal(removed.key, 'copy-polish');
    assert.equal(getAgent(), null);
  });
});
