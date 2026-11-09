import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import {
  assertFreshStamp,
  candidateSkillKeys,
  packageWriteClaim,
  planSkillDelete,
  skillDeletePatch,
  skillEnableGaps,
  skillEnableMessage,
  skillCanRevive,
  skillHistoryReadable,
  skillOfferedForNewUse,
  skillReadDecision,
  skillStartDecision,
  skillVisibleInAdmin,
  zipReplaceDecision,
} from '../../src/official-skill/skill-workflow';

describe('skill save and enable rules', () => {
  it('lets a named draft stay incomplete and lists enable gaps', () => {
    assert.deepEqual(skillEnableGaps({ name: '简报', summary: '', instruction: '', hasPackage: false }), ['summary', 'instruction']);
    assert.deepEqual(skillEnableGaps({ name: '简报', summary: '整理材料', instruction: '# 做', hasPackage: true }), []);
    assert.match(skillEnableMessage(['summary', 'instruction']), /启用失败：缺少一句话介绍、技能指令/);
    assert.match(skillEnableMessage(['instruction'], 'save'), /已启用技能仍需技能指令/);
  });

  it('allocates a unique key without taking a used one', () => {
    const taken = new Set(['skill', 'skill-aaaaaa']);
    const choices = candidateSkillKeys('会议', ['aaaaaa', 'bbbbbb']);
    const key = choices.find((item) => !taken.has(item));
    assert.equal(key, 'skill-bbbbbb');
    assert.deepEqual(candidateSkillKeys('Meeting Notes', []), ['meeting-notes']);
  });

  it('rejects a stale stamp and a mismatched zip before any replacement', () => {
    assert.throws(() => assertFreshStamp('2026-11-09T00:00:00.000Z', '2026-11-08T00:00:00.000Z'), ConflictException);
    assertFreshStamp('2026-11-09T00:00:00.000Z', '2026-11-09T00:00:00.000Z');
    assertFreshStamp('2026-11-09T00:00:00.000Z');
    const mismatch = zipReplaceDecision('brief', { key: 'other', keyDerived: false });
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.match(mismatch.message, /原技能未替换/);
    assert.deepEqual(zipReplaceDecision('brief', { key: 'skill-import', keyDerived: true }), { ok: true, key: 'brief' });
    assert.deepEqual(zipReplaceDecision('brief', { key: 'brief', keyDerived: false }), { ok: true, key: 'brief' });
    assert.throws(
      () => packageWriteClaim({ updatedAt: '2026-11-09T00:00:00.000Z', revision: 3 }, '2026-11-08T00:00:00.000Z'),
      ConflictException,
    );
    assert.deepEqual(
      packageWriteClaim({ updatedAt: '2026-11-09T00:00:00.000Z', revision: 3 }, '2026-11-09T00:00:00.000Z'),
      { revision: 4 },
    );
  });

  it('hides enabled and linked skills without dropping history', () => {
    const enabled = planSkillDelete({ enabled: true, linkedAgentCount: 2 });
    assert.equal(enabled.allowed, true);
    assert.equal(enabled.retainPackages, true);
    assert.equal(enabled.retainAgentLinks, true);
    assert.equal(enabled.retainUserHistory, true);
    const now = new Date('2026-11-09T00:00:00.000Z');
    const patch = skillDeletePatch(now);
    assert.equal(patch.enabledAt, null);
    assert.equal(patch.deletedAt, now);
    const hidden = { deletedAt: now, enabledAt: null, revision: 4 };
    assert.equal(skillVisibleInAdmin(hidden), false);
    assert.equal(skillOfferedForNewUse(hidden), false);
    assert.equal(skillHistoryReadable(4), true);
    assert.equal(skillHistoryReadable(undefined), false);
    assert.equal(skillOfferedForNewUse({ deletedAt: null, enabledAt: now, revision: 4 }), true);
    assert.deepEqual(skillStartDecision({ deleted: true, enabled: false, revision: 4 }), {
      ok: false,
      code: 'OFFICIAL_SKILL_DELETED',
      message: '技能已删除，请重新选择',
    });
    const disabled = skillStartDecision({ deleted: false, enabled: false, revision: 4 });
    assert.equal(disabled.ok, false);
    if (!disabled.ok) assert.equal(disabled.code, 'OFFICIAL_CONTENT_DISABLED');
    assert.equal(skillReadDecision({ deleted: true, enabled: false, pinnedRevision: 4 }).ok, true);
    assert.equal(skillReadDecision({ deleted: true, enabled: false, pinnedRevision: undefined }).ok, false);
    assert.equal(skillCanRevive(true), false);
    assert.equal(skillCanRevive(false), true);
  });
});
