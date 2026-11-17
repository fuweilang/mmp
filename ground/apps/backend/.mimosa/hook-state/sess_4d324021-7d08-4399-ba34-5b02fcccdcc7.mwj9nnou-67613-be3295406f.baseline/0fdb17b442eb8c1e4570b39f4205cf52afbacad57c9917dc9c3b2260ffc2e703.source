import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { AccessScope, KbStatus, MemberRole, TenantType } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { removeStoredFile, saveTenantFile } from '../src/knowledge/storage';

const requireCompiled = createRequire(__dirname + '/api-test.cjs');
const { AppModule } = requireCompiled('../dist/app.module.js') as { AppModule: new () => object };
const { PrismaService: CompiledPrismaService } = requireCompiled('../dist/prisma/prisma.service.js') as {
  PrismaService: new () => object;
};

/** 正式广场 22 卡：本文件绝不能 create/patch/publish/offline/改 grant。 */
const FORMAL_KEYS = [
  'boss', 'c3274112ed041', 'copy', 'copy-polish-master', 'data',
  'enterprise-product-answer', 'growth', 'gzh', 'interview', 'ip',
  'live', 'mammoth', 'method', 'niche', 'pyq', 'qc', 'sell', 'sifu',
  'spy', 'trans', 'video', 'xhs',
] as const;

const RUN = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
const TEMP_KEY = `tmp-exec-${RUN}`.slice(0, 64);
const SLUG_A = `tmp-exec-a-${RUN}`.slice(0, 40);
const SLUG_B = `tmp-exec-b-${RUN}`.slice(0, 40);
/** 登录 DTO 要求 /^1\d{10}$/，必须纯数字且避开种子 138/139。 */
function tempPhone(suffix: 0 | 1 | 2): string {
  const digits = [...randomBytes(8)].map((byte) => byte % 10).join('').slice(0, 8);
  return `17${suffix}${digits}`;
}
const PHONE_ADMIN = tempPhone(0);
const PHONE_MEMBER = tempPhone(1);
const PHONE_OUTSIDER = tempPhone(2);
const PASSWORD = `TmpExec!${RUN.slice(0, 8)}`;

let app: INestApplication;
let origin: string;
let adminCookie: string;
let prisma: PrismaService;

type Tracked = {
  agentId: string;
  tenantIds: string[];
  userIds: string[];
  folderIds: string[];
  documentIds: string[];
  storagePaths: string[];
  roleIds: string[];
};

const tracked: Tracked = {
  agentId: '',
  tenantIds: [],
  userIds: [],
  folderIds: [],
  documentIds: [],
  storagePaths: [],
  roleIds: [],
};

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
  // 仅复用平台超管登录做 Admin 写操作；绝不改其资料。
  adminCookie = await login('13800000001', '12345678');
});

after(async () => {
  await cleanupTracked().catch((error) => {
    console.error('execution isolation cleanup failed', error);
  });
  await app?.close();
});

test('临时官方智能体：目录、固定版本、资料交集和撤权在真实 API 上强制执行（不写正式22卡）', async () => {
  const beforeFormal = await snapshotFormal();
  try {
    const tenantA = await prisma.tenant.create({
      data: { name: `隔离企业A-${RUN}`, slug: SLUG_A, type: TenantType.ENTERPRISE },
    });
    const tenantB = await prisma.tenant.create({
      data: { name: `隔离企业B-${RUN}`, slug: SLUG_B, type: TenantType.ENTERPRISE },
    });
    tracked.tenantIds.push(tenantA.id, tenantB.id);
    await prisma.quota.create({ data: { tenantId: tenantA.id } });
    await prisma.quota.create({ data: { tenantId: tenantB.id } });
    await prisma.tenantAiWallet.create({ data: { tenantId: tenantA.id, balanceCoins: 0 } });
    await prisma.tenantAiWallet.create({ data: { tenantId: tenantB.id, balanceCoins: 0 } });

    const orgAdmin = await createTempMember(PHONE_ADMIN, `隔离管理员-${RUN}`, tenantA.id, 'org_admin');
    const member = await createTempMember(PHONE_MEMBER, `隔离员工-${RUN}`, tenantA.id, 'org_member');
    const outsider = await createTempMember(PHONE_OUTSIDER, `隔离外企-${RUN}`, tenantB.id, 'org_member');
    const tenantAdminCookie = await login(PHONE_ADMIN, PASSWORD);
    const tenantMemberCookie = await login(PHONE_MEMBER, PASSWORD);
    const outsiderCookie = await login(PHONE_OUTSIDER, PASSWORD);

    // 只创建本 run 专属 agent，禁止碰 enterprise-product-answer / 任何正式 key。
    assert.equal(FORMAL_KEYS.includes(TEMP_KEY as (typeof FORMAL_KEYS)[number]), false);
    let agent = await api<AdminAgentView>('/api/admin/official-agents', {
      method: 'POST',
      body: {
        key: TEMP_KEY,
        kind: 'KNOWLEDGE',
        name: `隔离执行答疑-${RUN}`,
        summary: '仅用于 API 隔离验收，可删',
        openingQuestions: ['我们的内部发布日期是什么？'],
        systemPrompt: '你是隔离测试答疑助手。只依据 enterprise_knowledge 返回的资料回答；没有依据时明确说明，不得编造。',
        toolScope: ['enterprise_knowledge'],
      },
    }, 201);
    tracked.agentId = agent.id;
    assert.equal(agent.key, TEMP_KEY);
    assert.equal(agent.status, 'DRAFT');

    agent = await api<AdminAgentView>(`/api/admin/official-agents/${agent.id}/publish`, { method: 'POST' });
    assert.equal(agent.status, 'PUBLISHED');
    const boundVersion = agent.versions.at(-1);
    assert.ok(boundVersion);
    agent = await api<AdminAgentView>(`/api/admin/official-agents/${agent.id}/grants`, {
      method: 'PUT',
      body: { tenantId: tenantA.id, versionId: boundVersion.id },
    });

    const publicCards = await api<PublicCard[]>('/api/official-agents', {}, 200, tenantMemberCookie);
    const card = publicCards.find((row) => row.id === agent.id);
    assert.ok(card, 'published temp agent must appear in public catalog');
    assert.equal(card.versionId, agent.onlineVersion?.id ?? boundVersion.id);
    assert.equal(card.executionGranted, true);
    assert.equal('systemPrompt' in card, false);
    assert.equal('kbFolderIds' in card, false);
    assert.equal('toolScope' in card, false);
    assert.equal(publicCards.filter((row) => FORMAL_KEYS.includes(row.key as (typeof FORMAL_KEYS)[number])).length, 22);
    assert.ok(publicCards.some((row) => row.key === TEMP_KEY));

    const otherTenantCards = await api<PublicCard[]>('/api/official-agents', {}, 200, outsiderCookie);
    const outsiderCard = otherTenantCards.find((row) => row.id === agent.id);
    assert.ok(outsiderCard, 'other-tenant members can browse published cards');
    assert.equal(outsiderCard.executionGranted, true);
    const platformCards = await api<PublicCard[]>('/api/official-agents', {}, 200, adminCookie);
    const platformCard = platformCards.find((row) => row.id === agent.id);
    assert.ok(platformCard, 'platform workspace can browse without enterprise context');
    assert.equal(platformCard.executionGranted, true);

    await api(`/api/official-agents/${agent.id}/scope`, {
      method: 'PUT', body: { kbFolderIds: [] },
    }, 200, tenantAdminCookie);
    const emptyConsole = await api<ConsoleCard[]>('/api/official-agents/console/scopes', {}, 200, tenantAdminCookie);
    assert.equal(emptyConsole.find((row) => row.id === agent.id)?.kbFolderIds.length, 0);
    await api(`/api/official-agents/console/scopes`, {}, 403, tenantMemberCookie);

    const folderA = await createFolder(tenantA.id, `智能体隔离-公开-${RUN}`);
    const folderB = await createFolder(tenantA.id, `智能体隔离-指定-${RUN}`);
    const folderC = await createFolder(tenantA.id, `智能体隔离-范围外-${RUN}`);
    const foreignFolder = await createFolder(tenantB.id, `智能体隔离-跨企业-${RUN}`);
    const query = '内部发布日期';
    const publicDoc = await createDocument(tenantA.id, folderA.id, `公开产品日历-${RUN}.txt`, query, AccessScope.ALL);
    const selectedDoc = await createDocument(
      tenantA.id, folderB.id, `管理员产品日历-${RUN}.txt`, query, AccessScope.SELECTED, orgAdmin.id,
    );
    const outsideDoc = await createDocument(tenantA.id, folderC.id, `范围外产品日历-${RUN}.txt`, query, AccessScope.ALL);

    await api(`/api/official-agents/${agent.id}/retrieve`, {
      method: 'POST', body: { versionId: boundVersion.id, query },
    }, 200, tenantAdminCookie).then((result) => assert.deepEqual((result as { hits: unknown[] }).hits, []));

    await api(`/api/official-agents/${agent.id}/scope`, {
      method: 'PUT', body: { kbFolderIds: [foreignFolder.id] },
    }, 400, tenantAdminCookie);
    const scoped = await api<ConsoleCard>(`/api/official-agents/${agent.id}/scope`, {
      method: 'PUT', body: { kbFolderIds: [folderA.id, folderB.id] },
    }, 200, tenantAdminCookie);
    assert.deepEqual(scoped.kbFolderIds, [folderA.id, folderB.id]);

    const adminHits = await retrieve(agent.id, boundVersion.id, query, tenantAdminCookie);
    assert.ok(adminHits.some((hit) => hit.documentId === publicDoc.id));
    assert.ok(adminHits.some((hit) => hit.documentId === selectedDoc.id));
    assert.equal(adminHits.some((hit) => hit.documentId === outsideDoc.id), false);
    const memberHits = await retrieve(agent.id, boundVersion.id, query, tenantMemberCookie);
    assert.ok(memberHits.some((hit) => hit.documentId === publicDoc.id));
    assert.equal(memberHits.some((hit) => hit.documentId === selectedDoc.id), false);
    assert.equal(memberHits.some((hit) => hit.documentId === outsideDoc.id), false);
    assert.deepEqual(await retrieve(agent.id, boundVersion.id, query, outsiderCookie, 403), []);

    const publicSource = await raw(
      `/api/official-agents/${agent.id}/sources/${publicDoc.id}?versionId=${boundVersion.id}`,
      tenantMemberCookie,
    );
    assert.equal(publicSource.status, 200);
    assert.match(publicSource.text, /内部发布日期/);
    const selectedSource = await raw(
      `/api/official-agents/${agent.id}/sources/${selectedDoc.id}?versionId=${boundVersion.id}`,
      tenantMemberCookie,
    );
    assert.equal(selectedSource.status, 404);
    const outsideSource = await raw(
      `/api/official-agents/${agent.id}/sources/${outsideDoc.id}?versionId=${boundVersion.id}`,
      tenantAdminCookie,
    );
    assert.equal(outsideSource.status, 404);

    agent = await api<AdminAgentView>(`/api/admin/official-agents/${agent.id}`, {
      method: 'PATCH', body: { systemPrompt: '新版本提示词，不得改变已经绑定的会话。' },
    });
    agent = await api<AdminAgentView>(`/api/admin/official-agents/${agent.id}/publish`, { method: 'POST' });
    assert.notEqual(agent.onlineVersion?.id, boundVersion.id);
    assert.equal(agent.grants.find((grant) => grant.tenant.id === tenantA.id)?.version.id, boundVersion.id);
    const frozen = await api<Execution>(`/api/official-agents/${agent.id}/resolve`, {
      method: 'POST', body: { versionId: boundVersion.id },
    }, 200, tenantMemberCookie);
    assert.equal(frozen.versionId, boundVersion.id);
    assert.equal(frozen.systemPrompt, boundVersion.systemPrompt);
    const foreignVersion = await api(`/api/official-agents/${agent.id}/resolve`, {
      method: 'POST', body: { versionId: 'not-a-version-of-this-agent' },
    }, 403, tenantMemberCookie);
    assert.match((foreignVersion as { message: string }).message, /版本无效/);

    await api(`/api/admin/official-agents/${agent.id}/offline`, { method: 'POST' });
    await api(`/api/official-agents/${agent.id}/resolve`, {
      method: 'POST', body: { versionId: boundVersion.id },
    }, 403, tenantMemberCookie);
    const afterOffline = await api<PublicCard[]>('/api/official-agents', {}, 200, tenantMemberCookie);
    assert.equal(afterOffline.some((row) => row.id === agent.id), false);
    assert.equal(afterOffline.filter((row) => FORMAL_KEYS.includes(row.key as (typeof FORMAL_KEYS)[number])).length, 22);

    await api(`/api/admin/official-agents/${agent.id}/publish`, { method: 'POST' });
    await api(`/api/admin/official-agents/${agent.id}/grants/${tenantA.id}`, { method: 'DELETE' });
    // 第一阶段：撤销 grant 仍可 resolve/开聊；企业私库 retrieve 才依赖 grant。
    await api(`/api/official-agents/${agent.id}/resolve`, {
      method: 'POST', body: { versionId: boundVersion.id },
    }, 200, tenantMemberCookie);
    await api(`/api/official-agents/${agent.id}/retrieve`, {
      method: 'POST', body: { versionId: boundVersion.id, query },
    }, 403, tenantMemberCookie);
    await api(`/api/admin/official-agents/${agent.id}/grants`, {
      method: 'PUT', body: { tenantId: tenantA.id, versionId: boundVersion.id },
    });
    await api(`/api/official-agents/${agent.id}/scope`, {
      method: 'PUT', body: { kbFolderIds: [folderA.id, folderB.id] },
    }, 200, tenantAdminCookie);

    await prisma.orgMember.delete({ where: { userId_tenantId: { userId: member.id, tenantId: tenantA.id } } });
    // 无企业成员身份仍可 resolve 官方已发布智能体（平台级资产）。
    await api(`/api/official-agents/${agent.id}/resolve`, {
      method: 'POST', body: { versionId: boundVersion.id },
    }, 200, tenantMemberCookie);
    await prisma.orgMember.create({ data: { userId: member.id, tenantId: tenantA.id, role: MemberRole.MEMBER } });
    assert.ok(outsider.id);
  } finally {
    await cleanupTracked();
    const afterFormal = await snapshotFormal();
    assert.deepEqual(afterFormal, beforeFormal, 'formal 22 cards must be unchanged after isolation test');
  }
});

type AdminAgentView = {
  id: string;
  key: string;
  status: string;
  onlineVersion: { id: string } | null;
  versions: Array<{ id: string; systemPrompt: string }>;
  grants: Array<{ tenant: { id: string }; version: { id: string } }>;
};

type PublicCard = { id: string; key: string; versionId: string; executionGranted: boolean };
type ConsoleCard = { id: string; kbFolderIds: string[] };
type Execution = { versionId: string; systemPrompt: string };
type Hit = { documentId: string };

type FormalSnap = Array<{
  key: string;
  status: string;
  onlineVersionId: string | null;
  systemPrompt: string;
  name: string;
  summary: string;
  grantsHash: string;
}>;

async function snapshotFormal(): Promise<FormalSnap> {
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

async function createTempMember(
  phone: string,
  name: string,
  tenantId: string,
  roleKey: 'org_admin' | 'org_member',
) {
  const existing = await prisma.user.findUnique({ where: { phone } });
  assert.equal(existing, null, `temp phone must be unused: ${phone}`);
  const user = await prisma.user.create({
    data: { phone, name, passwordHash: await bcrypt.hash(PASSWORD, 10) },
  });
  tracked.userIds.push(user.id);
  await prisma.orgMember.create({
    data: {
      userId: user.id,
      tenantId,
      role: roleKey === 'org_admin' ? MemberRole.ADMIN : MemberRole.MEMBER,
    },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user;
}

async function createFolder(tenantId: string, name: string) {
  const folder = await prisma.kbFolder.create({ data: { tenantId, name } });
  tracked.folderIds.push(folder.id);
  return folder;
}

async function createDocument(
  tenantId: string,
  folderId: string,
  name: string,
  query: string,
  visibility: AccessScope,
  selectedUserId?: string,
) {
  const storagePath = await saveTenantFile(tenantId, name, Buffer.from(`${query}：2026 年 12 月 1 日。`));
  tracked.storagePaths.push(storagePath);
  const document = await prisma.kbDocument.create({
    data: {
      tenantId, folderId, name, originalName: name, mimeType: 'text/plain',
      sizeBytes: 64, storagePath, status: KbStatus.READY, visibility,
    },
  });
  tracked.documentIds.push(document.id);
  await prisma.kbChunk.create({
    data: { tenantId, documentId: document.id, ordinal: 0, content: `${query}：2026 年 12 月 1 日。` },
  });
  if (visibility === AccessScope.SELECTED && selectedUserId) {
    await prisma.kbGrant.create({ data: { documentId: document.id, userId: selectedUserId } });
  }
  return document;
}

async function cleanupTracked() {
  const agentIds = new Set<string>();
  if (tracked.agentId) agentIds.add(tracked.agentId);
  const byKey = await prisma.officialAgent.findMany({ where: { key: TEMP_KEY }, select: { id: true } });
  for (const row of byKey) agentIds.add(row.id);

  for (const agentId of agentIds) {
    await prisma.officialAgent.updateMany({ where: { id: agentId }, data: { onlineVersionId: null } });
    await prisma.officialAgentTenantGrant.deleteMany({ where: { agentId } });
    await prisma.officialKbChunk.deleteMany({ where: { agentId } });
    await prisma.officialKbDocument.deleteMany({ where: { agentId } });
    await prisma.officialAgentVersion.deleteMany({ where: { agentId } });
    await prisma.officialAgent.deleteMany({ where: { id: agentId } });
  }
  tracked.agentId = '';

  if (tracked.documentIds.length) {
    await prisma.kbGrant.deleteMany({ where: { documentId: { in: tracked.documentIds } } });
    await prisma.kbChunk.deleteMany({ where: { documentId: { in: tracked.documentIds } } });
    await prisma.kbDocument.deleteMany({ where: { id: { in: tracked.documentIds } } });
    tracked.documentIds = [];
  }
  for (const storagePath of tracked.storagePaths.splice(0)) {
    await removeStoredFile(storagePath).catch(() => undefined);
  }
  if (tracked.folderIds.length) {
    await prisma.kbFolder.deleteMany({ where: { id: { in: tracked.folderIds } } });
    tracked.folderIds = [];
  }
  if (tracked.userIds.length) {
    await prisma.userRole.deleteMany({ where: { userId: { in: tracked.userIds } } });
    await prisma.orgMember.deleteMany({ where: { userId: { in: tracked.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: tracked.userIds } } });
    tracked.userIds = [];
  }
  if (tracked.tenantIds.length) {
    await prisma.officialAgentTenantGrant.deleteMany({ where: { tenantId: { in: tracked.tenantIds } } });
    await prisma.tenantAiWallet.deleteMany({ where: { tenantId: { in: tracked.tenantIds } } });
    await prisma.quota.deleteMany({ where: { tenantId: { in: tracked.tenantIds } } });
    await prisma.orgTree.deleteMany({
      where: {
        OR: [
          { parentId: { in: tracked.tenantIds } },
          { childId: { in: tracked.tenantIds } },
        ],
      },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: tracked.tenantIds } } });
    tracked.tenantIds = [];
  }
}

async function retrieve(agentId: string, versionId: string, query: string, cookie: string, expected = 200): Promise<Hit[]> {
  const result = await api<{ hits: Hit[] }>(`/api/official-agents/${agentId}/retrieve`, {
    method: 'POST', body: { versionId, query },
  }, expected, cookie);
  return expected === 200 ? result.hits : [];
}

async function login(phone: string, password: string) {
  const { response, body } = await rawRequest('/api/auth/login', { method: 'POST', body: { phone, password } });
  assert.equal(response.status, 200, JSON.stringify(body));
  const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.ok(cookie.includes('mammothai_access_token='));
  return cookie;
}

async function api<T>(
  path: string,
  init: { method?: string; body?: object } = {},
  expectedStatus = 200,
  cookie = adminCookie,
): Promise<T> {
  const { response, body } = await rawRequest(path, init, cookie);
  assert.equal(response.status, expectedStatus, JSON.stringify(body));
  return body as T;
}

async function raw(path: string, cookie: string) {
  const response = await fetch(new URL(path, origin), { headers: { cookie } });
  return { status: response.status, text: await response.text() };
}

async function rawRequest(
  path: string,
  init: { method?: string; body?: object },
  cookie?: string,
) {
  const response = await fetch(new URL(path, origin), {
    method: init.method ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { response, body: await response.json() as unknown };
}
