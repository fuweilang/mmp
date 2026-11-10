import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatPublishMissingToast,
  formatValidationToast,
  summarizeInvalidFields,
} from '../src/utils/admin-official-agent-form-errors';

test('summarizeInvalidFields dedupes and labels Chinese fields', () => {
  const { lines, firstProp } = summarizeInvalidFields({
    name: [{ message: '请输入专家名称' }, { message: '请输入专家名称' }],
    key: [{ message: '使用小写字母、数字和连字符，并以字母开头' }],
  });
  assert.equal(firstProp, 'name');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], '请输入专家名称');
  assert.match(lines[1]!, /标识/);
  assert.equal(formatValidationToast(lines), `请完善以下内容：${lines.join('；')}`);
});

test('formatPublishMissingToast stays one line', () => {
  assert.equal(formatPublishMissingToast(['一句话介绍', '角色定位', '角色定位']), '发布前请完善：一句话介绍、角色定位');
});

test('empty invalid fields still produce a toast line', () => {
  assert.equal(formatValidationToast(summarizeInvalidFields(false).lines), '请检查表单填写');
});
