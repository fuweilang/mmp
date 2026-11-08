import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { TenantType } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';

// Load the compiled Nest graph so decorator metadata matches production.
const requireCompiled = createRequire(__dirname + '/api-test.cjs');
const { AppModule } = requireCompiled('../dist/app.module.js') as { AppModule: new () => object };
const { PrismaService: CompiledPrismaService } = requireCompiled('../dist/prisma/prisma.service.js') as {
  PrismaService: new () => object;
};

const FORMAL_KEYS = [
  'boss', 'c3274112ed041', 'copy', 'copy-polish-master', 'data',
  'enterprise-product-answer', 'growth', 'gzh', 'interview', 'ip',
  'live', 'mammoth', 'method', 'niche', 'pyq', 'qc', 'sell', 'sifu',
  'spy', 'trans', 'video', 'xhs',
] as const;

const RUN = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
const TEMP_KEY = `tmp-admin-${RUN}`.slice(0, 64);
const SLUG = `tmp-admin-t-${RUN}`.slice(0, 40);

let app: INestApplication;
let origin: string;
let cookie: string;
let prisma: PrismaService;
let tempAgentId = '';
let tempTenantId = '';

before(async () => {
  app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  prisma = app.get(CompiledPrismaService) as PrismaService;

  const login = await request<{ user: { isPlatformAdmin: boolean } }>('/api/auth/login', {
    method: 'POST',
    body: { phone: '13800000001', password: '12345678' },
  });
  assert.equal(login.response.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.user.isPlatformAdmin, true);
  cookie = login.response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.ok(cookie.includes('mammothai_access_token='));
});

after(async () => {
  await cleanupTemp().catch((error) => console.error('admin api isolation cleanup failed', error));
  await app?.close();
});

test('真实 Admin API 在临时智能体上完成冻结版本、企业升级回滚、下架撤销和审计（不写正式22卡）', async () => {
  const beforeFormal = await snapshotFormal();
  try {
    const tenant = await prisma.tenant.create({
      data: { name: `隔离Admin企业-${RUN}`, slug: SLUG, type: TenantType.ENTERPRISE },
    });
    tempTenantId = tenant.id;
    await prisma.quota.create({ data: { tenantId: tenant.id } });

    assert.equal(FORMAL_KEYS.includes(TEMP_KEY as (typeof FORMAL_KEYS)[number]), false);
    let agent = await api<OfficialAgentView>('/api/admin/official-agents', {
      method: 'POST',
      body: {
        key: TEMP_KEY,
        kind: 'GENERAL',
        name: `隔离润色-${RUN}`,
        summary: '仅用于 Admin API 隔离验收，可删',
        openingQuestions: ['帮我润色这段产品说明'],
        systemPrompt: 'SENSITIVE_PROMPT_DO_NOT_AUDIT_TEMP_ADMIN',
        toolScope: [],
      },
    }, 201);
    tempAgentId = agent.id;

    agent = await api<OfficialAgentView>(`/api/admin/official-agents/${agent.id}/publish`, { method: 'POST' });
    const firstVersion = agent.versions.at(-1);
    assert.ok(firstVersion);
    agent = await api<OfficialAgentView>(`/api/admin/official-agents/${agent.id}/grants`, {
      method: 'PUT',
      body: { tenantId: tenant.id, versionId: firstVersion.id },
    });
    assert.equal(agent.grants[0]?.version.id, firstVersion.id);

    agent = await api<OfficialAgentView>(`/api/admin/official-agents/${agent.id}`, {
      method: 'PATCH',
      body: { summary: `接口验收草稿 ${new Date().toISOString()}` },
    });
    agent = await api<OfficialAgentView>(`/api/admin/official-agents/${agent.id}/publish`, { method: 'POST' });
    const latestVersion = agent.onlineVersion;
    assert.ok(latestVersion);
    assert.notEqual(latestVersion.id, firstVersion.id);
    assert.equal(agent.grants[0]?.version.id, firstVersion.id);

    agent = await api<OfficialAgentView>(`/api/admin/official-agents/${agent.id}/grants`, {
      method: 'PUT',
      body: { tenantId: tenant.id, versionId: latestVersion.id },
    });
    assert.equal(agent.grants[0]?.version.id, latestVersion.id);
    agent = await api<OfficialAgentView>(`/api/admin/official-agents/${agent.id}/grants`, {
      method: 'PUT',
      body: { tenantId: tenant.id, versionId: firstVersion.id },
    });
    assert.equal(agent.grants[0]?.version.id, firstVersion.id);

    agent = await api<OfficialAgentView>(`/api/admin/official-agents/${agent.id}/offline`, { method: 'POST' });
    assert.equal(agent.status, 'OFFLINE');
    const rejected = await api<{ message: string }>(`/api/admin/official-agents/${agent.id}/grants`, {
      method: 'PUT',
      body: { tenantId: tenant.id },
    }, 400);
    assert.match(rejected.message, /请先发布/);
    agent = await api<OfficialAgentView>(`/api/admin/official-agents/${agent.id}/grants/${tenant.id}`, { method: 'DELETE' });
    assert.equal(agent.grants[0]?.status, 'REVOKED');

    agent = await api<OfficialAgentView>(`/api/admin/official-agents/${agent.id}/publish`, { method: 'POST' });
    agent = await api<OfficialAgentView>(`/api/admin/official-agents/${agent.id}/grants`, {
      method: 'PUT',
      body: { tenantId: tenant.id, versionId: firstVersion.id },
    });
    assert.equal(agent.status, 'PUBLISHED');
    assert.equal(agent.grants[0]?.status, 'ACTIVE');
    assert.equal(agent.grants[0]?.version.id, firstVersion.id);

    const audit = await prisma.auditLog.findMany({
      where: {
        action: { startsWith: 'admin_' },
        OR: [{ meta: { path: ['agentId'], equals: agent.id } }],
      },
      orderBy: { createdAt: 'asc' },
    });
    for (const action of ['publish', 'grant', 'offline', 'revoke']) {
      assert.ok(audit.some((entry) => entry.action === `admin_${action}_official_agent`));
    }
    assert.ok(audit.every((entry) => !JSON.stringify(entry.meta).includes('SENSITIVE_PROMPT_DO_NOT_AUDIT_TEMP_ADMIN')));
  } finally {
    await cleanupTemp();
    const afterFormal = await snapshotFormal();
    assert.deepEqual(afterFormal, beforeFormal, 'formal 22 cards must be unchanged after admin api test');
  }
});

type OfficialAgentView = {
  id: string;
  key: string;
  status: string;
  onlineVersion: { id: string; systemPrompt: string } | null;
  versions: Array<{ id: string; systemPrompt: string }>;
  grants: Array<{ status: string; version: { id: string } }>;
};

async function snapshotFormal() {
  const rows = await prisma.officialAgent.findMany({
    where: { key: { in: [...FORMAL_KEYS] } },
    include: {
      grants: {
        orderBy: [{ tenantId: 'asc' }, { versionId: 'asc' }],
        select: { tenantId: true, versionId: true, status: true, kbFolderIds: true },
      },
    },
    orderBy: { key: 'asc' },
  });
  assert.equal(rows.length, 22);
  return rows.map((row) => ({
    key: row.key,
    status: row.status,
    onlineVersionId: row.onlineVersionId,
    systemPrompt: row.systemPrompt,
    name: row.name,
    summary: row.summary,
    grantsHash: JSON.stringify(row.grants),
  }));
}

async function cleanupTemp() {
  const ids = new Set<string>();
  if (tempAgentId) ids.add(tempAgentId);
  for (const row of await prisma.officialAgent.findMany({ where: { key: TEMP_KEY }, select: { id: true } })) {
    ids.add(row.id);
  }
  for (const agentId of ids) {
    await prisma.officialAgent.updateMany({ where: { id: agentId }, data: { onlineVersionId: null } });
    await prisma.officialAgentTenantGrant.deleteMany({ where: { agentId } });
    await prisma.officialAgentVersion.deleteMany({ where: { agentId } });
    await prisma.officialAgent.deleteMany({ where: { id: agentId } });
  }
  tempAgentId = '';
  if (tempTenantId) {
    await prisma.officialAgentTenantGrant.deleteMany({ where: { tenantId: tempTenantId } });
    await prisma.quota.deleteMany({ where: { tenantId: tempTenantId } });
    await prisma.tenant.deleteMany({ where: { id: tempTenantId } });
    tempTenantId = '';
  }
}

async function api<T>(path: string, init: { method?: string; body?: object } = {}, expectedStatus = 200): Promise<T> {
  const { response, body } = await request<T>(path, init, cookie);
  assert.equal(response.status, expectedStatus, JSON.stringify(body));
  return body;
}

async function request<T>(path: string, init: { method?: string; body?: object }, authCookie?: string) {
  const response = await fetch(new URL(path, origin), {
    method: init.method ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(authCookie === undefined ? {} : { cookie: authCookie }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { response, body: await response.json() as T };
}
