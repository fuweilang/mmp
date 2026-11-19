import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { preferOrgAdminRoleIds } from '../../src/tenant/org-preset-choice';

const presets = [
  { id: 'admin', key: 'org_admin' },
  { id: 'member', key: 'org_member' },
];

describe('preferOrgAdminRoleIds', () => {
  it('keeps admin when both enterprise presets are selected, in either order', () => {
    assert.deepEqual(preferOrgAdminRoleIds(['member', 'admin'], presets), ['admin']);
    assert.deepEqual(preferOrgAdminRoleIds(['admin', 'member', 'custom'], presets), ['admin', 'custom']);
  });

  it('leaves a single preset unchanged', () => {
    assert.deepEqual(preferOrgAdminRoleIds(['member'], presets), ['member']);
  });
});
