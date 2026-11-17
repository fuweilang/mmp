import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { AccessScope, KbStatus } from '@prisma/client';
import { KnowledgeService } from '../../src/knowledge/knowledge.service';

const name = '本地验收资料.md';
const mojibake = Buffer.from(name, 'utf8').toString('latin1');

test('legacy knowledge lists and downloads project stored multipart names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kb-name-'));
  const previous = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = root;
  await mkdir(join(root, 'tenant'));
  await writeFile(join(root, 'tenant', 'file.md'), 'hi');
  const row = {
    id: 'doc',
    tenantId: 'tenant',
    folderId: null,
    name: mojibake,
    originalName: mojibake,
    mimeType: 'text/markdown',
    sizeBytes: 4,
    status: KbStatus.READY,
    indexError: null,
    visibility: AccessScope.ALL,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    storagePath: 'tenant/file.md',
    folder: null,
    grants: [],
  };
  const prisma = {
    kbDocument: {
      findMany: async () => [row],
      findFirst: async () => row,
    },
    kbChunk: { findMany: async () => [] },
    $queryRawUnsafe: async () => { throw new Error('vector unavailable'); },
  };
  const tenants = {
    requireConsolePerm: async () => 'tenant',
    requireTenant: async () => 'tenant',
  };
  const service = new KnowledgeService(prisma as never, tenants as never);
  const user = { id: 'user' } as never;

  try {
    const listed = await service.documents(user, 'tenant');
    assert.equal(listed[0].name, name);
    assert.equal(listed[0].originalName, name);
    assert.equal(row.name, mojibake);
    const file = await service.file(user, 'tenant', 'doc');
    assert.equal(file.name, name);
  } finally {
    if (previous === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
