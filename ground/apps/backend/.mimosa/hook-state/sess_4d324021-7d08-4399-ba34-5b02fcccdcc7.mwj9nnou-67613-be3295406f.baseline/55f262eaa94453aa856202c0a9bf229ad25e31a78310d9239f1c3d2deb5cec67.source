import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { userAvatarPublicUrl } from '../src/auth/user-avatar';

const name = '11111111-1111-4111-8111-111111111111.png';

describe('user avatar path', () => {
  it('publishes only a stored account picture', () => {
    assert.equal(userAvatarPublicUrl(`user-avatars/${name}`), `/api/auth/avatars/${name}`);
    assert.equal(userAvatarPublicUrl(null), null);
    assert.equal(userAvatarPublicUrl(`official-avatars/${name}`), null);
    assert.equal(userAvatarPublicUrl(`user-avatars/../${name}`), null);
  });
});
