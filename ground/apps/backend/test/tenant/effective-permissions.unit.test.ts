import assert from 'node:assert/strict';
import { it } from 'node:test';
import { MemberRole, RoleScope } from '@prisma/client';
import { computeEffectivePermissions, listBoundRoleSources } from '../../src/permissions/effective';

type FakeRole = {
  key: string;
  scope: RoleScope;
  tenantId: string | null;
  permissions: { permKey: string }[];
};
type FakeMember = { userId: string; tenantId: string; role: MemberRole };

function fakeDb(rows: FakeRole[], memberships: FakeMember[]) {
  const db = {
    userRole: {
      findMany: async () => rows.map((role) => ({ role })),
    },
    orgPresetOverride: {
      findUnique: async () => null,
    },
    orgMember: {
      findUnique: async ({ where }: { where: { userId_tenantId: { userId: string; tenantId: string } } }) => {
        const key = where.userId_tenantId;
        return memberships.find((row) => row.userId === key.userId && row.tenantId === key.tenantId) ?? null;
      },
    },
  };
  return db as unknown as Parameters<typeof computeEffectivePermissions>[0];
}

const orgAdminPreset: FakeRole = {
  key: 'org_admin',
  scope: RoleScope.ORG_PRESET,
  tenantId: null,
  permissions: [{ permKey: 'portal.console.members' }, { permKey: 'portal.console.access' }, { permKey: 'terminal' }],
};
const orgMemberPreset: FakeRole = {
  key: 'org_member',
  scope: RoleScope.ORG_PRESET,
  tenantId: null,
  permissions: [{ permKey: 'portal.console.kb' }],
};
const platformAdminRole: FakeRole = {
  key: 'platform_admin',
  scope: RoleScope.PLATFORM,
  tenantId: null,
  permissions: [{ permKey: 'portal.admin.access' }],
};

it('管理员身份只在本企业生效：A 企业管理员在 B 企业只是普通成员', async () => {
  const db = fakeDb(
    [orgAdminPreset, orgMemberPreset],
    [
      { userId: 'dual', tenantId: 'ta', role: MemberRole.ADMIN },
      { userId: 'dual', tenantId: 'tb', role: MemberRole.MEMBER },
    ],
  );

  const inA = await computeEffectivePermissions(db, 'dual', 'ta');
  assert.ok(inA.effectivePermissions.includes('portal.console.members'));
  assert.ok(inA.effectivePermissions.includes('portal.console.kb'));
  assert.equal(inA.effectivePermissions.includes('terminal'), false);
  assert.equal(inA.isPlatformAdmin, false);

  const inB = await computeEffectivePermissions(db, 'dual', 'tb');
  assert.equal(inB.effectivePermissions.includes('portal.console.members'), false);
  assert.equal(inB.effectivePermissions.includes('terminal'), false);
  assert.ok(inB.effectivePermissions.includes('portal.console.kb'));
  assert.equal(inB.isPlatformAdmin, false);
});

it('平台管理员不受租户成员档限制', async () => {
  const db = fakeDb(
    [platformAdminRole, orgAdminPreset],
    [{ userId: 'platform', tenantId: 'tb', role: MemberRole.MEMBER }],
  );

  const inB = await computeEffectivePermissions(db, 'platform', 'tb');
  assert.equal(inB.isPlatformAdmin, true);
  assert.ok(inB.effectivePermissions.includes('portal.admin.access'));
  assert.ok(inB.effectivePermissions.includes('portal.console.members'));

  const noTenant = await computeEffectivePermissions(db, 'platform', null);
  assert.equal(noTenant.isPlatformAdmin, true);
  assert.ok(noTenant.effectivePermissions.includes('portal.console.members'));
});

it('无租户上下文保持原行为：org_admin 预设仍计入', async () => {
  const db = fakeDb([orgAdminPreset], []);

  const effective = await computeEffectivePermissions(db, 'someone', null);
  assert.ok(effective.effectivePermissions.includes('portal.console.members'));
  assert.equal(effective.isPlatformAdmin, false);
});
it('角色来源展示与有效权限同源：不在 B 企业展示 org_admin 预置包', async () => {
  const db = fakeDb(
    [orgAdminPreset, orgMemberPreset],
    [
      { userId: 'dual', tenantId: 'ta', role: MemberRole.ADMIN },
      { userId: 'dual', tenantId: 'tb', role: MemberRole.MEMBER },
    ],
  );
  const inA = await listBoundRoleSources(db, 'dual', 'ta');
  assert.ok(inA.some((row) => row.key === 'org_admin'));
  const inB = await listBoundRoleSources(db, 'dual', 'tb');
  assert.equal(inB.some((row) => row.key === 'org_admin'), false);
  assert.ok(inB.some((row) => row.key === 'org_member'));
});
