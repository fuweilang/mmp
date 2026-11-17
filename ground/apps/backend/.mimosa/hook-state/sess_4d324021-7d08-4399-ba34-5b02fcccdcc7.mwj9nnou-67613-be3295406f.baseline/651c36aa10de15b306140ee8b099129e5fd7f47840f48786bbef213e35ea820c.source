import { ExpertRuntimeService } from '../src/official-agent/expert-runtime.service';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { OfficialAgentStatus } from '@prisma/client';
import { AdminOfficialAgentsService } from '../src/admin/admin-official-agents.service';

function harness(seed: {
  name?: string;
  summary?: string;
  systemPrompt?: string;
  role?: string;
  toolScope?: string[];
}) {
  const actor = { id: 'admin-1' } as never;
  const agent = {
    id: 'agent-1',
    key: 'copy-polish',
    kind: 'GENERAL' as const,
    status: OfficialAgentStatus.DRAFT,
    name: seed.name ?? '',
    summary: seed.summary ?? '',
    openingQuestions: [],
    systemPrompt: seed.systemPrompt ?? '',
    toolScope: seed.toolScope ?? [],
    expertDefinition: {
      schemaVersion: 1,
      profile: { role: seed.role ?? '' },
    },
    category: null,
    capabilities: [],
    onlineVersionId: null,
    customAvatarPath: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    skillLinks: [],
  };
  const prisma: Record<string, unknown> = {
    officialAgent: {
      findUnique: async () => ({ ...agent, onlineVersion: null, versions: [], grants: [], skillLinks: [] }),
      update: async () => agent,
    },
    officialAgentVersion: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'ver-1', ...data }),
    },
    auditLog: { create: async ({ data }: { data: unknown }) => data },
    userRole: {findFirst: async()=>({roleId:"super"})},
    user: {findUnique: async()=>({status:"active"}), findMany: async () => [{ id: 'admin-1', name: '平台管理员' }] },
  };
  (prisma as { $transaction: Function }).$transaction = async (
    cb: (tx: Record<string, unknown>) => Promise<unknown>,
  ) => cb(prisma);
  const service = new AdminOfficialAgentsService(
    prisma as never,
    { adminScope: async () => null } as never,
    { loadAssetFiles: () => [], syncFromAssets: async () => [] } as never,
    { setAgentSkillLinks: async () => undefined, snapshotLinkedSkills: async () => [] } as never,
    new ExpertRuntimeService(prisma as never, {} as never),
  );
  return { service, actor };
}

describe('publish requirements aggregation', () => {
  it('aggregates all missing publish fields in one error', async () => {
    const { service, actor } = harness({});
    await assert.rejects(() => service.publish(actor, 'agent-1'), (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      const message = String((error as BadRequestException).message);
      assert.match(message, /专家名称/);
      assert.match(message, /一句话介绍/);
      assert.match(message, /专家指令/);
      // empty name => normalize also leaves role empty
      assert.match(message, /角色定位/);
      return true;
    });
  });

  it('rejects invalid tool ids together with other gaps', async () => {
    const { service, actor } = harness({
      name: '文案',
      summary: '',
      systemPrompt: '',
      role: '编辑',
      toolScope: ['not_a_real_tool'],
    });
    await assert.rejects(() => service.publish(actor, 'agent-1'), (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      const message = String((error as BadRequestException).message);
      assert.match(message, /一句话介绍/);
      assert.match(message, /专家指令/);
      assert.match(message, /可用工具/);
      return true;
    });
  });

  it('publishes when required fields are present', async () => {
    const { service, actor } = harness({
      name: '文案专家',
      summary: '润色中文',
      systemPrompt: '认真润色',
      role: '资深编辑',
    });
    const published = await service.publish(actor, 'agent-1');
    assert.ok(published);
  });
});
