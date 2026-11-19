import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chooseOrgPresetIds, memberRoles } from '../src/components/members/memberDisplay';

const roles = [
  { id: 'admin', key: 'org_admin' },
  { id: 'member', key: 'org_member' },
];

describe('enterprise preset choice', () => {
  it('drops the other preset when the second one is checked', () => {
    assert.deepEqual(chooseOrgPresetIds(['member'], ['member', 'admin'], roles), ['admin']);
    assert.deepEqual(chooseOrgPresetIds(['admin'], ['admin', 'member'], roles), ['member']);
  });

  it('shows only this enterprise preset', () => {
    const row = {
      role: 'MEMBER' as const,
      user: {
        roles: [
          { role: { id: 'admin', key: 'org_admin', name: '企业管理员' } },
          { role: { id: 'member', key: 'org_member', name: '企业成员' } },
        ],
      },
    };
    assert.deepEqual(memberRoles(row).map((role) => role.label), ['企业成员']);
  });
});
