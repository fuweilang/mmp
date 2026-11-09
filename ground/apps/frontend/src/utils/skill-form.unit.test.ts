import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampPage, keepStoredExecution, skillDeleteConfirm, skillDeleteRequest, skillFormIssues, skillFormToast } from './skill-form';

const base = {
  name: '简报',
  summary: '',
  instruction: '',
  mode: 'form' as const,
  replacingZip: false,
  editing: false,
  enabled: false,
  enable: false,
  hasPackage: false,
  zipSelected: false,
  zipReady: false,
  zipError: '',
  contentSource: 'none' as const,
};

describe('skill form validation', () => {
  it('saves a hand-written draft with only a name', () => {
    assert.deepEqual(skillFormIssues(base), {});
  });

  it('saves an incomplete first draft before enable instead of rejecting the write', () => {
    assert.deepEqual(skillFormIssues({ ...base, enable: true }), {});
    const kept = keepStoredExecution({
      enable: true,
      summary: '',
      instruction: '',
      previousSummary: '',
      previousInstruction: '',
      hasPackage: false,
    });
    assert.equal(kept.summary, '');
    assert.equal(kept.instruction, '');
  });

  it('keeps an existing intro and package when enable is attempted with blanks', () => {
    const kept = keepStoredExecution({
      enable: true,
      summary: '  ',
      instruction: '',
      previousSummary: '整理材料',
      previousInstruction: '按步骤输出',
      hasPackage: true,
    });
    assert.equal(kept.summary, undefined);
    assert.equal(kept.instruction, undefined);
  });

  it('does not ask a zip draft for a hand-written instruction', () => {
    const issues = skillFormIssues({
      ...base,
      mode: 'zip',
      replacingZip: true,
      enable: true,
      summary: '整理',
      zipSelected: false,
    });
    assert.equal(issues.instruction, undefined);
    assert.equal(issues.zip, undefined);
    assert.equal(skillFormIssues({
      ...base,
      editing: true,
      replacingZip: true,
      enable: true,
      summary: '整理',
      hasPackage: true,
      contentSource: 'zip',
      zipSelected: true,
      zipError: '技能包已损坏，无法解压',
    }).zip, '技能包已损坏，无法解压');
  });

  it('keeps an enabled skill from being saved incomplete', () => {
    const issues = skillFormIssues({
      ...base,
      editing: true,
      enabled: true,
      hasPackage: true,
      contentSource: 'form',
      summary: '',
      instruction: '',
    });
    assert.ok(issues.summary);
    assert.ok(issues.instruction);
  });

  it('surfaces a failed zip preview without a generic identifier message', () => {
    const issues = skillFormIssues({
      ...base,
      mode: 'zip',
      replacingZip: true,
      zipSelected: true,
      zipError: '技能包已损坏，无法解压',
    });
    assert.equal(issues.zip, '技能包已损坏，无法解压');
    assert.equal(skillFormToast(issues).includes('标识'), false);
  });

  it('confirms deletion by name and does not call the API on cancel or while busy', () => {
    const copy = skillDeleteConfirm({ name: '简报整理' });
    assert.equal(copy.message, '确定删除技能「简报整理」？删除后不可再选用，已有对话和任务记录不受影响。');
    assert.equal(copy.confirm, '删除');
    assert.equal(skillDeleteRequest({ confirmed: false, inFlight: false }), 'skip');
    assert.equal(skillDeleteRequest({ confirmed: true, inFlight: true }), 'skip');
    assert.equal(skillDeleteRequest({ confirmed: true, inFlight: false }), 'call');
    assert.equal(clampPage(2, 10, 11), 2);
    assert.equal(clampPage(2, 10, 10), 1);
    assert.equal(clampPage(3, 10, 0), 1);
  });
});
