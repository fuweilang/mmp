import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  normalizeAvatarRelativePath,
  officialAvatarPublicUrl,
  resolveOfficialAvatar,
  resolveOfficialAvatarFile,
} from '../src/official-agent/gallery-avatars';
import { loadOfficialAgentAssets } from '../src/official-agent/official-agent-assets';

describe('official agent gallery avatars', () => {
  let root = '';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'oa-avatar-'));
    mkdirSync(join(root, 'avatars'), { recursive: true });
    writeFileSync(join(root, 'avatars', 'growth.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
    writeFileSync(join(root, 'avatars', 'data.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('accepts only avatars/<file> relative paths', () => {
    assert.equal(normalizeAvatarRelativePath('avatars/growth.jpg'), 'avatars/growth.jpg');
    assert.equal(normalizeAvatarRelativePath('../avatars/growth.jpg'), null);
    assert.equal(normalizeAvatarRelativePath('avatars/../secret.jpg'), null);
    assert.equal(normalizeAvatarRelativePath('agents/growth.json'), null);
  });

  it('resolves same-key convention and explicit historical remaps from asset JSON', () => {
    assert.equal(resolveOfficialAvatar('growth', null, root)?.fileName, 'growth.jpg');
    assert.equal(resolveOfficialAvatar('niche', null, root), null);
    // evidenced remap niche→data.jpg recorded as agents/niche.json avatar
    assert.equal(resolveOfficialAvatar('niche', 'avatars/data.jpg', root)?.fileName, 'data.jpg');
    assert.equal(resolveOfficialAvatar('ip', 'avatars/growth.jpg', root)?.fileName, 'growth.jpg');
  });

  it('serves only basename files under avatars/ and rejects unknown names', () => {
    // basename() neutralizes ../ before the assets-root check.
    assert.equal(resolveOfficialAvatarFile('../growth.jpg', root)?.fileName, 'growth.jpg');
    assert.equal(resolveOfficialAvatarFile('../../etc/passwd', root), null);
    assert.equal(resolveOfficialAvatarFile('growth.jpg', root)?.fileName, 'growth.jpg');
    assert.equal(resolveOfficialAvatarFile('missing.jpg', root), null);
  });

  it('builds a public absolute avatar URL', () => {
    assert.equal(
      officialAvatarPublicUrl('growth.jpg', 'https://www.mmai.vip'),
      'https://www.mmai.vip/api/official-agents/avatars/growth.jpg',
    );
  });
});

describe('official agent avatar assets pack', () => {
  it('covers same-key files and historical remaps from agents/*.json', () => {
    const assets = loadOfficialAgentAssets();
    assert.equal(assets.length, 20);
    const expected = {
      ip: 'avatars/growth.jpg',
      gzh: 'avatars/copy.jpg',
      niche: 'avatars/data.jpg',
      sell: 'avatars/live.jpg',
      method: 'avatars/trans.jpg',
      interview: 'avatars/qc.jpg',
    };
    for (const [key, avatar] of Object.entries(expected)) {
      const asset = assets.find((row) => row.key === key);
      assert.ok(asset, key);
      assert.equal(asset.avatar, avatar);
      assert.equal(resolveOfficialAvatar(key, asset.avatar)?.relativePath, avatar);
    }
    assert.equal(resolveOfficialAvatar('growth', null)?.fileName, 'growth.jpg');
    assert.equal(resolveOfficialAvatar('mammoth', null), null);
    assert.equal(resolveOfficialAvatar('c3274112ed041', null), null);
  });
});
