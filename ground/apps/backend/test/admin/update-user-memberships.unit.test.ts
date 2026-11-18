import assert from 'node:assert/strict';
import { it } from 'node:test';
import { MemberRole, type User } from '@prisma/client';
import { AdminSupportService } from '../../src/admin/admin-support.service';
import { AdminUsersService } from '../../src/admin/admin-users.service';

type Membership = { userId: string; tenantId: string; role: MemberRole };

function harness() {
  const memberships: Membership[] = [
    { userId: 'yang', tenantId: 't1', role: MemberRole.ADMIN },
    { userId: 'yang', tenantId: 't2', role: MemberRole.ADMIN },
    { userId: 'yang', tenantId: 't4', role: MemberRole.OWNER },
  ];
  const userRoles: Array<{ userId: string; roleKey: string }> = [{ userId: 'yang', roleKey: 'org_admin' }];
  const roles = [
    { id: 'r-admin', key: 'org_admin', permissions: [] as Array<{ permKey: string }> },
    { id: 'r-member', key: 'org_member', permissions: [] as Array<{ permKey: string }> },
  ];
  let orgMemberDeletes = 0;
  const userRecord = () => ({
    id: 'yang',
    name: '杨泽昆',
    phone: '18552375428',
    email: null,
    status: 'active',
    isPlatformAdmin: false,
    createdAt: new Date(),
    memberships: memberships.filter((row) => row.userId === 'yang').map((row) => ({
      role: row.role,
      tenantId: row.tenantId,
      tenant: { id: row.tenantId, name: row.tenantId, status: 'active' },
    })),
    roles: userRoles.filter((row) => row.userId === 'yang').map((row) => ({
      role: { key: row.roleKey, name: row.roleKey, scope: 'ORG_PRESET', permissions: [] },
    })),
  });
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id?: string } }) => (where.id === 'yang' ? userRecord() : null),
      update: async () => userRecord(),
      count: async () => 1,
    },
    orgMember: {
      findMany: async ({ where }: { where: { userId?: string; tenantId?: { in: string[] } } }) => memberships.filter((row) => {
        if (where.userId && row.userId !== where.userId) return false;
        if (where.tenantId?.in && !where.tenantId.in.includes(row.tenantId)) return false;
        return true;
      }),
      findUnique: async ({ where }: { where: { userId_tenantId: { userId: string; tenantId: string } } }) => {
        const key = where.userId_tenantId;
        return memberships.find((row) => row.userId === key.userId && row.tenantId === key.tenantId) ?? null;
      },
      update: async ({ where, data }: { where: { userId_tenantId: { userId: string; tenantId: string } }; data: { role: MemberRole } }) => {
        const key = where.userId_tenantId;
        const row = memberships.find((item) => item.userId === key.userId && item.tenantId === key.tenantId);
        if (!row) throw new Error('missing membership');
        row.role = data.role;
        return row;
      },
      deleteMany: async () => {
        orgMemberDeletes += 1;
        return { count: 0 };
      },
    },
    userRole: {
      findMany: async ({ where }: { where: { userId: string } }) => userRoles
        .filter((row) => row.userId === where.userId)
        .map((row) => ({ role: roles.find((role) => role.key === row.roleKey) })),
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        for (let index = userRoles.length - 1; index >= 0; index -= 1) {
          if (userRoles[index].userId === where.userId) userRoles.splice(index, 1);
        }
        return { count: 1 };
      },
      createMany: async ({ data }: { data: Array<{ userId: string; roleId: string }> }) => {
        for (const row of data) {
          const role = roles.find((item) => item.id === row.roleId);
          if (!role) throw new Error(`missing role ${row.roleId}`);
          userRoles.push({ userId: row.userId, roleKey: role.key });
        }
        return { count: data.length };
      },
    },
    role: {
      findMany: async ({ where }: { where: { key: { in: string[] } } }) => roles.filter((role) => where.key.in.includes(role.key)),
    },
    auditLog: { create: async () => ({}) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  const support = new AdminSupportService(prisma as never);
  const service = new AdminUsersService(prisma as never, support);
  const actor = { id: 'admin', isPlatformAdmin: true } as User;
  return { service, actor, memberships, userRoles, orgMemberDeletes: () => orgMemberDeletes };
}

it('改一家的角色时保留其余企业，并按全部成员档重算全局角色', async () => {
  const { service, actor, memberships, userRoles, orgMemberDeletes } = harness();
  await service.updateUser(actor, 'yang', {
    name: '杨泽昆',
    membershipRoles: [{ tenantId: 't1', role: 'MEMBER' }],
  });
  assert.deepEqual(
    memberships.map((row) => [row.tenantId, row.role]),
    [['t1', MemberRole.MEMBER], ['t2', MemberRole.ADMIN], ['t4', MemberRole.OWNER]],
  );
  assert.deepEqual(userRoles.map((row) => row.roleKey).sort(), ['org_admin', 'org_member']);
  assert.equal(orgMemberDeletes(), 0);
});

it('不能给还没加入的企业写角色', async () => {
  const { service, actor, memberships } = harness();
  await assert.rejects(
    () => service.updateUser(actor, 'yang', { membershipRoles: [{ tenantId: 'missing', role: 'ADMIN' }] }),
    /只能修改已加入的企业角色/,
  );
  assert.equal(memberships.length, 3);
  assert.equal(memberships[0].role, MemberRole.ADMIN);
});
