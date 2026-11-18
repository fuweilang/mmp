import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOfficialAgentDto, UpdateOfficialAgentDto } from '../src/admin/dto/official-agent.dto';

test('create and update names reject trimmed short names with Chinese messages', async () => {
  for (const Dto of [CreateOfficialAgentDto, UpdateOfficialAgentDto]) {
    for (const name of ['是', ' 是 ', '  ']) {
      const errors = await validate(plainToInstance(Dto, { name }));
      const issue = errors.find(error => error.property === 'name');
      assert.equal(issue?.constraints?.minLength, '名称至少需要2个字');
    }
    const valid = plainToInstance(Dto, { name: '  中文名称  ' });
    assert.equal(valid.name, '中文名称');
    assert.equal((await validate(valid)).some(error => error.property === 'name'), false);
  }
});
