import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { skillFormIssues, skillFormToast } from './skill-form';

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

  it('asks for the intro and instruction before enabling a hand-written skill', () => {
    const issues = skillFormIssues({ ...base, enable: true });
    assert.equal(issues.summary, '请填写一句话介绍');
    assert.equal(issues.instruction, '请填写技能指令');
    assert.match(skillFormToast(issues), /一句话介绍/);
    assert.equal(skillFormIssues({ ...base, enable: true, summary: '整理', instruction: '按步骤输出' }).instruction, undefined);
  });

  it('does not ask a zip skill for a hand-written instruction', () => {
    const issues = skillFormIssues({
      ...base,
      mode: 'zip',
      replacingZip: true,
      enable: true,
      summary: '整理',
      zipSelected: false,
    });
    assert.equal(issues.instruction, undefined);
    assert.match(issues.zip || '', /技能包/);
    assert.equal(skillFormIssues({
      ...base,
      editing: true,
      replacingZip: true,
      enable: true,
      summary: '整理',
      hasPackage: true,
      contentSource: 'zip',
    }).zip, undefined);
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
