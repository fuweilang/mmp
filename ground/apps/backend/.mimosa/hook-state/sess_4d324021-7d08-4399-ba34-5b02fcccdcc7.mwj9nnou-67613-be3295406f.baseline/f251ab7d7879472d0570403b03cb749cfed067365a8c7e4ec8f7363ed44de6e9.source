import 'reflect-metadata';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { AdminEnterprisesService } from '../src/admin/admin-enterprises.service';

it('creates 猛犸总部 once and binds every active super admin', async () => {
  const created: object[] = [];
  const upserts: object[] = [];
  let platform: { id: string; name: string; type: string } | null = null;
  const db = {
    tenant: {
      findFirst: async () => platform,
      create: async (query: { data: { name: string } }) => {
        created.push(query);
        platform = { id: 'hq', name: query.data.name, type: 'PLATFORM' };
        return platform;
      },
      update: async () => { throw new Error('existing headquarters keeps its id'); },
      findMany: async () => [],
    },
    userRole: { findMany: async () => [{ userId: 'super-a' }, { userId: 'super-b' }] },
    orgMember: { upsert: async (query: object) => { upserts.push(query); } },
  };
  const service = new AdminEnterprisesService(db as never, { adminScope: async () => null, presentEnterprise: (row: object) => row } as never);
  const first = await service.ensureHeadquarters();
  const second = await service.ensureHeadquarters();
  assert.equal(first.id, 'hq');
  assert.equal(second.id, 'hq');
  assert.equal(created.length, 1);
  assert.deepEqual(upserts, [
    { where: { userId_tenantId: { userId: 'super-a', tenantId: 'hq' } }, create: { userId: 'super-a', tenantId: 'hq', role: 'ADMIN' }, update: {} },
    { where: { userId_tenantId: { userId: 'super-b', tenantId: 'hq' } }, create: { userId: 'super-b', tenantId: 'hq', role: 'ADMIN' }, update: {} },
    { where: { userId_tenantId: { userId: 'super-a', tenantId: 'hq' } }, create: { userId: 'super-a', tenantId: 'hq', role: 'ADMIN' }, update: {} },
    { where: { userId_tenantId: { userId: 'super-b', tenantId: 'hq' } }, create: { userId: 'super-b', tenantId: 'hq', role: 'ADMIN' }, update: {} },
  ]);
});
