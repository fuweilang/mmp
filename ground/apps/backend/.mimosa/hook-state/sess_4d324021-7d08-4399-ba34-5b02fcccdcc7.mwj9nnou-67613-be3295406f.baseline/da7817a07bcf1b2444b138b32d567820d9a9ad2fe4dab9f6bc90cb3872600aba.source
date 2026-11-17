import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { OfficialSkillService } from '../../src/official-skill/official-skill.service';

/**
 * P1-3 断环护栏：展示文案翻译只经 `SkillDisplayCompletionPort` 调用云端补全。
 * 1. dryRun 不触发 LLM、不写库（原审计要求补的 dryRun 快照）；
 * 2. 正常批次只改展示字段并写一条审计；
 * 3. 非平台管理员直接 403，且不触达 LLM。
 */
function createHarness() {
  const rows = [
    {
      id: 'skill-1',
      key: 'spark-video',
      name: 'spark-video',
      summary: 'Runs a video pipeline',
      sourceName: 'spark-video',
      sourceSummary: 'Runs a video pipeline',
      displayProvenance: 'source',
      displaySourceHash: null as string | null,
    },
  ];
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const calls: Array<{ userId: string; tenantId: string | null; body: unknown }> = [];
  const prisma = {
    officialSkill: {
      findMany: async () => rows,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, data });
        return { id: where.id, ...data };
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
  };
  const llm = {
    completeOnce: async (user: { id: string }, tenantId: string | null, body: unknown) => {
      calls.push({ userId: user.id, tenantId, body });
      return { content: JSON.stringify({ name: '火花视频流水线', summary: '一键跑通视频流水线' }), modelRef: 'cloud/auto' };
    },
  };
  const service = new OfficialSkillService(prisma as never, llm as never);
  return { service, rows, updates, audits, calls };
}

describe('official skill display translation port', () => {
  it('dryRun 只算候选，不调用 LLM 也不写库', async () => {
    const { service, updates, audits, calls } = createHarness();
    const report = await service.translateDisplayBatch({ id: 'admin-1', isPlatformAdmin: true } as never, { dryRun: true });
    assert.equal(report.dryRun, true);
    assert.equal(report.total, 1);
    assert.equal(report.needingTranslation, 1);
    assert.equal(report.selected, 1);
    assert.equal(report.translated, 0);
    assert.equal(report.modelRef, null);
    assert.equal(calls.length, 0, 'dryRun 不得触达云模型');
    assert.equal(updates.length, 0);
    assert.equal(audits.length, 0);
  });

  it('真实批次经端口补全并只写展示字段', async () => {
    const { service, updates, audits, calls } = createHarness();
    const report = await service.translateDisplayBatch({ id: 'admin-1', isPlatformAdmin: true } as never, {});
    assert.equal(report.translated, 1);
    assert.equal(report.failed, 0);
    assert.deepEqual(report.translatedKeys, ['spark-video']);
    assert.equal(report.modelRef, 'cloud/auto');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.tenantId, null, '平台级翻译不带租户');
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.id, 'skill-1');
    assert.equal(updates[0]?.data.name, '火花视频流水线');
    assert.equal(updates[0]?.data.summary, '一键跑通视频流水线');
    assert.equal(updates[0]?.data.displayProvenance, 'machine');
    assert.equal(updates[0]?.data.displayModelRef, 'cloud/auto');
    assert.equal(updates[0]?.data.instruction, undefined, '不得改写技能指令/包内容');
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.action, 'admin_translate_official_skill_display');
  });

  it('非平台管理员被拒绝且不触达 LLM', async () => {
    const { service, calls } = createHarness();
    await assert.rejects(
      () => service.translateDisplayBatch({ id: 'member-1', isPlatformAdmin: false } as never, {}),
      (error: unknown) => error instanceof ForbiddenException,
    );
    assert.equal(calls.length, 0);
  });
});
