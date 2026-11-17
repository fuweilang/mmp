import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { createRequire } from 'node:module';
import type { PrismaService } from '../src/prisma/prisma.service';

const requireCompiled = createRequire(__dirname + '/api-test.cjs');
const { AppModule } = requireCompiled('../dist/app.module.js') as { AppModule: new () => object };
const { PrismaService: CompiledPrismaService } = requireCompiled('../dist/prisma/prisma.service.js') as {
  PrismaService: new () => object;
};

let app: INestApplication;
let origin: string;
let adminCookie: string;
let memberCookie: string;
let prisma: PrismaService;
const TEMP_KEY = `tmp-bulk-ops-${Date.now().toString(36)}`;
let tempAgentId = '';

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

  const adminLogin = await request<{ user: { isPlatformAdmin: boolean } }>('/api/auth/login', {
    method: 'POST',
    body: { phone: '13800000001', password: '12345678' },
  });
  assert.equal(adminLogin.response.status, 200, JSON.stringify(adminLogin.body));
  assert.equal(adminLogin.body.user.isPlatformAdmin, true);
  adminCookie = cookieHeader(adminLogin.response);

  const memberLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { phone: '13900001002', password: '12345678' },
  });
  assert.equal(memberLogin.response.status, 200, JSON.stringify(memberLogin.body));
  memberCookie = cookieHeader(memberLogin.response);
});

after(async () => {
  if (tempAgentId) {
    await prisma.officialAgentTenantGrant.deleteMany({ where: { agentId: tempAgentId } });
    await prisma.officialAgentVersion.deleteMany({ where: { agentId: tempAgentId } });
    await prisma.officialAgent.deleteMany({ where: { id: tempAgentId } });
  }
  await prisma.officialAgent.deleteMany({ where: { key: TEMP_KEY } });
  await app?.close();
});

test('批量导入/授权/撤销/下架可审计，且普通成员拒绝写操作', async () => {
  const huawei = await prisma.tenant.findUnique({ where: { slug: '华为' } });
  const xiaomi = await prisma.tenant.findUnique({ where: { slug: '小米' } });
  assert.ok(huawei && xiaomi);

  const denied = await request('/api/admin/official-agents/asset-catalog', {}, memberCookie);
  assert.equal(denied.response.status, 403);

  const catalog = await api<Array<{ key: string }>>('/api/admin/official-agents/asset-catalog');
  assert.ok(catalog.some((item) => item.key === 'mammoth'));

  const created = await api<OfficialAgentView>('/api/admin/official-agents', {
    method: 'POST',
    body: {
      key: TEMP_KEY,
      kind: 'GENERAL',
      name: '临时批量验收助手',
      summary: '仅用于任务8验收，可删',
      openingQuestions: ['你好'],
      systemPrompt: 'SENSITIVE_PROMPT_DO_NOT_AUDIT_TEMP_BULK_OPS',
      toolScope: [],
    },
  }, 201);
  tempAgentId = created.id;

  const published = await api<OfficialAgentView>(`/api/admin/official-agents/${tempAgentId}/publish`, {
    method: 'POST',
  });
  assert.equal(published.status, 'PUBLISHED');
  assert.ok(published.onlineVersion);

  const grant = await api<{
    summary: { granted: number; skipped: number; errors: number };
    agent: OfficialAgentView;
  }>(`/api/admin/official-agents/${tempAgentId}/grants/bulk`, {
    method: 'POST',
    body: { tenantIds: [huawei.id, xiaomi.id], versionId: published.onlineVersion!.id },
  });
  assert.equal(grant.summary.granted, 2);
  assert.equal(grant.agent.activeGrantCount, 2);

  const revoke = await api<{
    summary: { revoked: number };
    agent: OfficialAgentView;
  }>(`/api/admin/official-agents/${tempAgentId}/grants/bulk-revoke`, {
    method: 'POST',
    body: { tenantIds: [huawei.id, xiaomi.id] },
  });
  assert.equal(revoke.summary.revoked, 2);
  assert.equal(revoke.agent.activeGrantCount, 0);

  const offline = await api<{
    summary: { offlined: number; skipped: number; errors: number };
  }>('/api/admin/official-agents/bulk-offline', {
    method: 'POST',
    body: { ids: [tempAgentId] },
  });
  assert.equal(offline.summary.offlined, 1);

  const detail = await api<OfficialAgentView>(`/api/admin/official-agents/${tempAgentId}`);
  assert.equal(detail.status, 'OFFLINE');

  const importUnknown = await api<{
    summary: { errors: number };
    errors: Array<{ key: string }>;
  }>('/api/admin/official-agents/import-assets', {
    method: 'POST',
    body: { keys: ['__no_such_asset_key__'] },
  });
  assert.equal(importUnknown.summary.errors, 1);

  const audit = await api<{ rows: Array<{ action: string; meta: unknown }> }>(
    '/api/admin/audit?page=1&pageSize=100&actionPrefix=admin_',
  );
  const related = audit.rows.filter((row) => {
    const meta = JSON.stringify(row.meta ?? {});
    return meta.includes(tempAgentId) || row.action.includes('bulk');
  });
  assert.ok(related.some((row) => row.action === 'admin_bulk_grant_official_agent'));
  assert.ok(related.some((row) => row.action === 'admin_bulk_revoke_official_agent'));
  assert.ok(related.some((row) => row.action === 'admin_bulk_offline_official_agent'));
  assert.ok(
    related.every((row) => !JSON.stringify(row.meta).includes('SENSITIVE_PROMPT_DO_NOT_AUDIT_TEMP_BULK_OPS')),
  );

  // cleanup inside test as well so leftover grants never stick if after fails early
  await prisma.officialAgentTenantGrant.deleteMany({ where: { agentId: tempAgentId } });
  await prisma.officialAgentVersion.deleteMany({ where: { agentId: tempAgentId } });
  await prisma.officialAgent.deleteMany({ where: { id: tempAgentId } });
  const gone = await prisma.officialAgent.findUnique({ where: { id: tempAgentId } });
  assert.equal(gone, null);
  tempAgentId = '';
});

type OfficialAgentView = {
  id: string;
  key: string;
  status: string;
  activeGrantCount?: number;
  onlineVersion: { id: string } | null;
};

function cookieHeader(response: Response) {
  const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.ok(cookie.includes('mammothai_access_token='));
  return cookie;
}

async function api<T>(path: string, init: { method?: string; body?: object } = {}, expectedStatus = 200): Promise<T> {
  const { response, body } = await request<T>(path, init, adminCookie);
  assert.equal(response.status, expectedStatus, JSON.stringify(body));
  return body;
}

async function request<T>(path: string, init: { method?: string; body?: object } = {}, authCookie?: string) {
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
