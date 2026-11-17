import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import {
  LLM_TENANT_CONCURRENCY_LIMIT,
  LLM_USER_CONCURRENCY_LIMIT,
  LlmConcurrencyService,
} from '../src/llm/llm-concurrency.service';

function service(t: import('node:test').TestContext, user: string, tenant: string): LlmConcurrencyService {
  const previousUser = process.env.LLM_USER_MAX_CONCURRENCY;
  const previousTenant = process.env.LLM_TENANT_MAX_CONCURRENCY;
  process.env.LLM_USER_MAX_CONCURRENCY = user;
  process.env.LLM_TENANT_MAX_CONCURRENCY = tenant;
  t.after(() => {
    if (previousUser === undefined) delete process.env.LLM_USER_MAX_CONCURRENCY;
    else process.env.LLM_USER_MAX_CONCURRENCY = previousUser;
    if (previousTenant === undefined) delete process.env.LLM_TENANT_MAX_CONCURRENCY;
    else process.env.LLM_TENANT_MAX_CONCURRENCY = previousTenant;
  });
  return new LlmConcurrencyService();
}

function expectLimit(run: () => void, code: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 429);
    const body = error.getResponse() as Record<string, unknown>;
    assert.equal(body.code, code);
    assert.equal(body.retryAfterSeconds, 1);
    return true;
  });
}

test('用户并发互不影响，释放后可继续请求', (t) => {
  const limiter = service(t, '1', '2');
  const release = limiter.acquire('u1', 't1');
  expectLimit(() => limiter.acquire('u1', 't1'), LLM_USER_CONCURRENCY_LIMIT);
  const releaseOther = limiter.acquire('u2', 't1');
  releaseOther();
  release();
  release();
  const releaseAgain = limiter.acquire('u1', 't1');
  releaseAgain();
});

test('企业并发按企业隔离，不占用被拒绝请求的名额', (t) => {
  const limiter = service(t, '2', '1');
  const release = limiter.acquire('u1', 't1');
  expectLimit(() => limiter.acquire('u2', 't1'), LLM_TENANT_CONCURRENCY_LIMIT);
  const releaseOtherTenant = limiter.acquire('u2', 't2');
  releaseOtherTenant();
  release();
  const releaseSameTenant = limiter.acquire('u2', 't1');
  releaseSameTenant();
});

test('0 表示不限制，非法配置在启动时失败', (t) => {
  const unlimited = service(t, '0', '0');
  const releases = Array.from({ length: 20 }, () => unlimited.acquire('u1', 't1'));
  releases.forEach(release => release());

  const previous = process.env.LLM_USER_MAX_CONCURRENCY;
  process.env.LLM_USER_MAX_CONCURRENCY = '-1';
  t.after(() => {
    if (previous === undefined) delete process.env.LLM_USER_MAX_CONCURRENCY;
    else process.env.LLM_USER_MAX_CONCURRENCY = previous;
  });
  assert.throws(() => new LlmConcurrencyService(), /LLM_USER_MAX_CONCURRENCY/);
});
