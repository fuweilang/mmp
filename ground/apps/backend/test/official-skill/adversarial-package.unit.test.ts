import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import JSZip from 'jszip';
import { parseSkillZip, writeSkillPackageToDisk } from '../../src/official-skill/skill-package';
import { completeSkillManifest } from '../../src/official-skill/skill-package-format';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const body = '---\nname: adversarial-test\ndescription: Local hostile archive fixture\n---\n# Test\nRead references/guide.txt.';
async function archive(files: Record<string, string | Buffer>) {
  const zip = new JSZip();
  for (const [path, bytes] of Object.entries({ 'SKILL.md': body, ...files })) zip.file(path, bytes, { createFolders: false });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}
async function rejectPath(path: string) {
  await assert.rejects(parseSkillZip(await archive({ [path]: 'ATTACK_SENTINEL' })), /路径|损坏|冲突/);
}

describe('adversarial skill package admission', () => {
  for (const path of ['../escape.txt', 'assets/../../escape.txt', '/absolute.txt', 'C:/escape.txt', 'assets\\escape.txt', 'assets//empty.txt', 'assets/./dot.txt', 'assets/name:stream', 'assets/trailing.', 'assets/trailing ', 'assets/CON.txt', 'assets/lpt9', 'assets/null\0.txt', 'assets/e\u0301.txt']) {
    it(`rejects hostile raw archive path ${JSON.stringify(path)}`, () => rejectPath(path));
  }
  it('rejects an encrypted archive rather than partially importing readable entries', async () => {
    const bytes = await archive({ 'references/guide.txt': 'secret' });
    for (let i = 0; i + 4 < bytes.length; i++) {
      const signature = bytes.readUInt32LE(i);
      if (signature === 0x04034b50) bytes.writeUInt16LE(bytes.readUInt16LE(i + 6) | 1, i + 6);
      if (signature === 0x02014b50) bytes.writeUInt16LE(bytes.readUInt16LE(i + 8) | 1, i + 8);
    }
    await assert.rejects(parseSkillZip(bytes), /损坏|路径/);
  });
  it('rejects unsupported compression methods', async () => {
    const bytes = await archive({ 'assets/item.txt': 'value' });
    for (let i = 0; i + 12 < bytes.length; i++) {
      const signature = bytes.readUInt32LE(i);
      if (signature === 0x04034b50) bytes.writeUInt16LE(99, i + 8);
      if (signature === 0x02014b50) bytes.writeUInt16LE(99, i + 10);
    }
    await assert.rejects(parseSkillZip(bytes), /损坏|路径/);
  });
  it('rejects truncated central directories', async () => {
    const bytes = await archive({ 'assets/item.txt': 'value' });
    await assert.rejects(parseSkillZip(bytes.subarray(0, bytes.length - 16)), /损坏|路径/);
  });
  it('rejects a forged expanded size smaller than the actual data', async () => {
    const bytes = await archive({ 'assets/item.txt': 'REPEATED_CONTENT_SENTINEL' });
    for (let i = 0; i + 28 < bytes.length; i++) {
      const signature = bytes.readUInt32LE(i);
      if (signature === 0x04034b50) bytes.writeUInt32LE(1, i + 22);
      if (signature === 0x02014b50) bytes.writeUInt32LE(1, i + 24);
    }
    await assert.rejects(parseSkillZip(bytes), /损坏|大小|容量/);
  });
  it('rejects CRC-invalid stored bytes instead of publishing a digest for corrupted content', async () => {
    const bytes = await archive({ 'assets/item.txt': 'CRC_ORIGINAL_SENTINEL' });
    const at = bytes.indexOf(Buffer.from('CRC_ORIGINAL_SENTINEL'));
    assert.ok(at > 0); bytes[at] = 88;
    await assert.rejects(parseSkillZip(bytes), /损坏|校验|CRC/);
  });
  it('rejects filenames too long for the execution filesystem before preview succeeds', async () => {
    await assert.rejects(parseSkillZip(await archive({ ['assets/' + 'a'.repeat(256)]: 'value' })), /路径|文件名/);
  });
  it('rejects CRC mismatch for a deflated multi-chunk binary entry', async () => {
    const zip = new JSZip(); zip.file('SKILL.md', body); zip.file('assets/blob.bin', Buffer.alloc(300000, 193));
    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    let changed = false;
    for (let i = 0; i + 46 < bytes.length; i++) {
      if (bytes.readUInt32LE(i) !== 0x02014b50) continue;
      const length = bytes.readUInt16LE(i + 28), name = bytes.subarray(i + 46, i + 46 + length).toString();
      if (name === 'assets/blob.bin') { bytes.writeUInt32LE((bytes.readUInt32LE(i + 16) ^ 0xffffffff) >>> 0, i + 16); changed = true; break; }
    }
    assert.equal(changed, true);
    await assert.rejects(parseSkillZip(bytes), /损坏|校验|CRC/);
  });
  it('preserves valid multi-chunk binary ZIP entries and filename byte boundaries on disk', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-boundary-')); roots.push(root);
    const previous = process.env.UPLOAD_DIR; process.env.UPLOAD_DIR = root;
    try {
      const zip = new JSZip(); zip.file('SKILL.md', body);
      const data = Buffer.alloc(300000); for (let i = 0; i < data.length; i++) data[i] = i % 251;
      const names = ['a'.repeat(255), '中'.repeat(85), '😀'.repeat(63)];
      for (const name of names) zip.file('assets/' + name, data);
      const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      const parsed = await parseSkillZip(bytes), storage = await writeSkillPackageToDisk('boundary', 1, parsed, bytes);
      for (const name of names) assert.deepEqual(await readFile(join(root, storage.storagePath, 'assets', name)), data);
    } finally { if (previous === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = previous; }
  });
  for (const name of ['中'.repeat(86), '😀'.repeat(64)]) {
    it(`rejects a multibyte filename of ${Buffer.byteLength(name)} UTF-8 bytes`, async () => {
      await assert.rejects(parseSkillZip(await archive({ ['assets/' + name]: 'value' })), /路径|文件名/);
    });
  }
  it('preserves a zero-byte resource and never executes a packaged script during import', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-adversarial-')); roots.push(root);
    const previous = process.env.UPLOAD_DIR; process.env.UPLOAD_DIR = root;
    try {
      const bytes = await archive({ 'references/empty.txt': '', 'scripts/attack.cjs': `require('node:fs').writeFileSync(${JSON.stringify(join(root, 'executed'))}, 'BAD')` });
      const parsed = await parseSkillZip(bytes);
      const storage = await writeSkillPackageToDisk('adversarial-local', 1, parsed, bytes);
      assert.equal((await readFile(join(root, storage.storagePath, 'references/empty.txt'))).length, 0);
      await assert.rejects(readFile(join(root, 'executed')), /ENOENT/);
    } finally { if (previous === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = previous; }
  });
  it('rejects exponential YAML aliases and execution tags', async () => {
    for (const yaml of ['name: !js/function >\n  function () { return 1 }', 'a: &a [x,x,x,x]\nb: &b [*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b]\nd: [*c,*c,*c,*c]']) {
      await assert.rejects(parseSkillZip(await archive({ 'SKILL.md': `---\n${yaml}\n---\n# Body` })), /YAML/);
    }
  });
  it('rejects tampered durable package metadata and unknown format versions', async () => {
    const parsed = await parseSkillZip(await archive({ 'assets/file.txt': 'value' }));
    for (const mutate of [
      (m: typeof parsed.manifest) => { Object.assign(m, { packageFormat: 3 }); },
      (m: typeof parsed.manifest) => { m.files![0]!.sha256 = '0'.repeat(64); },
      (m: typeof parsed.manifest) => { m.files![0]!.bytes = -1; },
      (m: typeof parsed.manifest) => { m.limits!.maxTotalBytes = 10485761; },
    ]) {
      const manifest = structuredClone(parsed.manifest); mutate(manifest);
      assert.throws(() => completeSkillManifest(manifest));
    }
  });
});
