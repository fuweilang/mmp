import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { keepStoredExecution, skillFormIssues, skillFormToast } from './skill-form';

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
});
