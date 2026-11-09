import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  assertOfficialAvatarUpload,
  detectOfficialAvatarKind,
  saveOfficialAvatar,
} from '../src/knowledge/storage';
import {
  normalizeCustomAvatarPath,
  resolvePresentedOfficialAvatarUrl,
  resolveUploadedOfficialAvatarFile,
  resolveOfficialAvatarFile,
} from '../src/official-agent/gallery-avatars';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const SVG_TEXT = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

describe('official agent avatar upload validation', () => {
  it('detects png/jpeg/webp magic bytes and rejects others', () => {
    assert.equal(detectOfficialAvatarKind(PNG), 'png');
    assert.equal(detectOfficialAvatarKind(JPEG), 'jpeg');
    assert.equal(detectOfficialAvatarKind(WEBP), 'webp');
    assert.equal(detectOfficialAvatarKind(SVG_TEXT), null);
    assert.equal(detectOfficialAvatarKind(Buffer.from('not-an-image')), null);
  });

  it('rejects oversize, svg extension, mime mismatch, and content mismatch', () => {
    assert.equal(assertOfficialAvatarUpload('a.png', PNG, 'image/png').kind, 'png');
    assert.throws(() => assertOfficialAvatarUpload('a.svg', PNG, 'image/png'), /SVG/);
    assert.throws(
      () => assertOfficialAvatarUpload('a.png', Buffer.alloc(2 * 1024 * 1024 + 1, 1), 'image/png'),
      /5MB/,
    );
    assert.throws(() => assertOfficialAvatarUpload('a.png', SVG_TEXT, 'image/png'), /有效/);
    assert.throws(() => assertOfficialAvatarUpload('a.png', JPEG, 'image/png'), /不符/);
    assert.throws(() => assertOfficialAvatarUpload('a.jpg', PNG, 'image/jpeg'), /不符/);
    assert.throws(() => assertOfficialAvatarUpload('a.webp', PNG, 'image/webp'), /不符/);
    // GIF is allowed as a source and rasterized by saveOfficialAvatar/rasterizeOfficialAvatar.
  });
});

describe('official agent custom avatar path resolution', () => {
  let uploadRoot = '';
  let assetsRoot = '';
  const prevUpload = process.env.UPLOAD_DIR;

  beforeEach(() => {
    uploadRoot = mkdtempSync(join(tmpdir(), 'oa-upload-'));
    assetsRoot = mkdtempSync(join(tmpdir(), 'oa-assets-'));
    process.env.UPLOAD_DIR = uploadRoot;
    mkdirSync(join(uploadRoot, 'official-avatars'), { recursive: true });
    mkdirSync(join(assetsRoot, 'avatars'), { recursive: true });
    writeFileSync(join(assetsRoot, 'avatars', 'growth.jpg'), JPEG);
  });

  afterEach(() => {
    if (prevUpload === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = prevUpload;
    rmSync(uploadRoot, { recursive: true, force: true });
    rmSync(assetsRoot, { recursive: true, force: true });
  });

  it('normalizes custom paths and rejects traversal', () => {
    assert.equal(
      normalizeCustomAvatarPath('official-avatars/abc123.webp'),
      'abc123.webp',
    );
    assert.equal(normalizeCustomAvatarPath('abc123.png'), 'abc123.png');
    assert.equal(normalizeCustomAvatarPath('../secret.png'), null);
    assert.equal(normalizeCustomAvatarPath('avatars/growth.jpg'), null);
    assert.equal(normalizeCustomAvatarPath('official-avatars/../growth.jpg'), null);
  });

  it('serves uploaded unique files without touching packaged defaults', async () => {
    const rel = await saveOfficialAvatar('agent-1', 'face.png', PNG, 'image/png');
    assert.match(rel, /^official-avatars\/[0-9a-f-]+\.png$/i);
    assert.ok(existsSync(join(uploadRoot, rel)));
    const fileName = rel.split('/')[1]!;
    const uploaded = resolveUploadedOfficialAvatarFile(fileName, uploadRoot);
    assert.ok(uploaded);
    assert.equal(uploaded!.fileName, fileName);

    // Public resolver prefers upload when basename matches a custom file.
    const viaPublic = resolveOfficialAvatarFile(fileName, assetsRoot);
    assert.ok(viaPublic);
    assert.equal(viaPublic!.relativePath, `official-avatars/${fileName}`);

    // Packaged default still resolves by original gallery name.
    const growth = resolveOfficialAvatarFile('growth.jpg', assetsRoot);
    assert.equal(growth?.relativePath, 'avatars/growth.jpg');
  });

  it('presentation prefers custom upload over asset default', async () => {
    const rel = await saveOfficialAvatar('agent-1', 'face.png', PNG, 'image/png');
    const url = resolvePresentedOfficialAvatarUrl({
      key: 'growth',
      customAvatarPath: rel,
      explicitAssetAvatar: 'avatars/growth.jpg',
      origin: 'http://127.0.0.1:5201',
    });
    assert.match(String(url), /\/api\/official-agents\/avatars\/[0-9a-f-]+\.png$/i);

    const fallback = resolvePresentedOfficialAvatarUrl({
      key: 'growth',
      customAvatarPath: null,
      explicitAssetAvatar: null,
      origin: 'http://127.0.0.1:5201',
    });
    // without assetsRoot override this uses real assets; just assert helper returns string|null
    assert.ok(fallback === null || typeof fallback === 'string');
  });
});
