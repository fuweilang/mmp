import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import JSZip from 'jszip';
import { parseSkillZip, writeSkillPackageToDisk } from '../../src/official-skill/skill-package';
// Exercise the same emitted decorator metadata consumed by the actual API process.
const { OfficialSkillController } = require('../../dist/src/official-skill/official-skill.controller.js');
const { OfficialSkillService } = require('../../dist/src/official-skill/official-skill.service.js');
const { JwtGuard } = require('../../dist/src/auth/jwt.guard.js');
const { PrismaService } = require('../../dist/src/prisma/prisma.service.js');

let app: INestApplication, origin = '', root = '', oldUpload: string | undefined;
let token = '', browserToken = '', tenantToken = '';
const account = { id: 'local-adversarial-user', status: 'active' };
const tenant = { status: 'active' };
const row = { id: 'http-skill', key: 'http-attack', name: 'HTTP fixture', summary: 'Local only', enabledAt: new Date() as Date | null, deletedAt: null as Date | null, currentRevision: 1, packages: [] as Record<string, unknown>[], currentPackage: {} as Record<string, unknown> };
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'skill-adversarial-http-')); oldUpload = process.env.UPLOAD_DIR; process.env.UPLOAD_DIR = root;
  const zip = new JSZip(); zip.file('SKILL.md', '# HTTP fixture'); zip.file('scripts/example.html', '<script>ATTACHMENT_SENTINEL</script>');
  const bytes = await zip.generateAsync({ type: 'nodebuffer' }), parsed = await parseSkillZip(bytes), storage = await writeSkillPackageToDisk(row.id, 1, parsed, bytes);
  const pkg = { revision: 1, storagePath: storage.storagePath, manifest: parsed.manifest }; row.packages = [pkg]; row.currentPackage = pkg;
  const prisma = { officialSkill: { findUnique: async () => row }, user: { findUnique: async () => account }, userRole: { findMany: async () => [] }, orgPresetOverride: { findUnique: async () => null }, orgMember: { findUnique: async () => ({ role: 'MEMBER' }) }, tenant: { findUnique: async () => tenant } };
  const jwt = new JwtService({ secret: 'local-adversarial-fixture-only' });
  token = await jwt.signAsync({ sub: account.id }); browserToken = await jwt.signAsync({ sub: account.id, purpose: 'browser-sso' }); tenantToken = await jwt.signAsync({ sub: account.id, tenantId: 'fixture-tenant' });
  class LocalHttpFixture {}
  Module({ controllers: [OfficialSkillController], providers: [{ provide: OfficialSkillService, useValue: new OfficialSkillService(prisma, {}) }, JwtGuard, { provide: JwtService, useValue: jwt }, { provide: PrismaService, useValue: prisma }, { provide: ConfigService, useValue: new ConfigService() }] })(LocalHttpFixture);
  app = await NestFactory.create(LocalHttpFixture, { logger: ['error'], abortOnError: false }); app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
});
after(async () => { await app?.close(); if (oldUpload === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = oldUpload; if (root) await rm(root, { recursive: true, force: true }); });
async function request(path: string, auth: string | null = token) { return fetch(`${origin}/api/official-skills/${row.id}/${path}`, { headers: auth === null ? {} : { Authorization: `Bearer ${auth}` } }); }

describe('adversarial authenticated HTTP contract (local database fixture)', () => {
  it('rejects missing, forged and browser-only tokens', async () => {
    for (const auth of [null, 'forged-token', browserToken]) { const response = await request('content?revision=1&packageFormat=2', auth); assert.equal(response.status, 401); await response.arrayBuffer(); }
  });
  it('rejects inactive accounts through the real JWT guard', async () => {
    account.status = 'disabled';
    try { const response = await request('content?revision=1&packageFormat=2'); assert.equal(response.status, 401); await response.arrayBuffer(); } finally { account.status = 'active'; }
  });
  it('rejects a disabled tenant even with an otherwise valid token', async () => {
    tenant.status = 'disabled';
    try { const response = await request('content?revision=1&packageFormat=2', tenantToken); assert.equal(response.status, 403); await response.arrayBuffer(); } finally { tenant.status = 'active'; }
  });
  it('negotiates complete content and refuses an old client explicitly', async () => {
    const good = await request('content?revision=1&packageFormat=2'); assert.equal(good.status, 200); assert.equal((await good.json()).packageFormat, 2);
    const old = await request('content?revision=1'); assert.equal(old.status, 409); assert.equal((await old.json()).code, 'SKILL_CLIENT_UPGRADE_REQUIRED');
  });
  for (const query of ['revision=-1&packageFormat=2', 'revision=1.5&packageFormat=2', 'revision=1&packageFormat=3', 'revision=1&packageFormat=2&unexpected=1']) {
    it(`rejects invalid query ${query}`, async () => { const response = await request(`content?${query}`); assert.equal(response.status, 400); await response.arrayBuffer(); });
  }
  for (const path of ['../SKILL.md', '/SKILL.md', '%2e%2e%2fSKILL.md', 'scripts/example.html/../../SKILL.md', 'scripts/missing.html']) {
    it(`denies undeclared/traversal resource ${path}`, async () => { const response = await request(`resources?revision=1&path=${encodeURIComponent(path)}`); assert.equal(response.status, 404); await response.arrayBuffer(); });
  }
  it('serves HTML-shaped script data only as a no-sniff attachment', async () => {
    const response = await request('resources?revision=1&path=scripts%2Fexample.html'); assert.equal(response.status, 200); assert.match(response.headers.get('content-type')!, /^application\/octet-stream/); assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.match(response.headers.get('content-disposition')!, /^attachment;/); assert.match(response.headers.get('cache-control')!, /no-store/); assert.match(await response.text(), /ATTACHMENT_SENTINEL/);
  });
  it('rejects unavailable pinned revisions without falling back to the current package', async () => { const response = await request('content?revision=999&packageFormat=2'); assert.equal(response.status, 404); await response.arrayBuffer(); });
  it('enforces existing disabled/deleted current-read rules and retains explicit historical reads', async () => {
    row.enabledAt = null; row.deletedAt = new Date();
    try {
      const current = await request('content?packageFormat=2'); assert.equal(current.status, 403); await current.arrayBuffer();
      const pinned = await request('content?revision=1&packageFormat=2'); assert.equal(pinned.status, 200); await pinned.arrayBuffer();
    } finally { row.enabledAt = new Date(); row.deletedAt = null; }
  });
});
