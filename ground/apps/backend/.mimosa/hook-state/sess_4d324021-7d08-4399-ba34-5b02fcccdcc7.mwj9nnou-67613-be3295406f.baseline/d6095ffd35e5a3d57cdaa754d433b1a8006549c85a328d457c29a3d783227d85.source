import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import JSZip from 'jszip';
import { buildSkillPackageFromForm, parseSkillZip, retargetPackageKey, writeSkillPackageToDisk } from '../../src/official-skill/skill-package';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function zip(files: Record<string, string | Buffer>, executable?: string) {
  const archive = new JSZip();
  for (const [name, data] of Object.entries(files)) archive.file(name, data, {
    unixPermissions: name === executable ? 0o100755 : 0o100644,
  });
  return archive.generateAsync({ type: 'nodebuffer', platform: 'UNIX', compression: 'DEFLATE' });
}

const instruction = '---\nname: complete-pack\ndescription: |\n  Read the guide\n  and execute the script.\nmetadata:\n  category: demo\n---\n# Complete\nUse scripts/run.js with resources/source.txt and assets/data.bin.\n';

describe('complete skill package', () => {
  it('keeps a UTF-8 BOM consistent with the indexed entry and rejects invalid YAML', async () => {
    const text = '\uFEFF' + instruction;
    const parsed = await parseSkillZip(await zip({ 'SKILL.md': text }));
    assert.equal(parsed.instruction, text);
    assert.equal(parsed.manifest.files?.[0]?.bytes, Buffer.byteLength(text));
    for (const invalid of ['---\nname: a\nname: b\n---\nBody', '---\nname: !execute code\n---\nBody']) {
      await assert.rejects(parseSkillZip(await zip({ 'SKILL.md': invalid })), /YAML/);
    }
  });

  it('applies configured lower instruction limits to both uploaded and form-built packages', async () => {
    const old = process.env.MMP_SKILL_MAX_INSTRUCTION_BYTES;
    process.env.MMP_SKILL_MAX_INSTRUCTION_BYTES = '8';
    try {
      await assert.rejects(parseSkillZip(await zip({ 'SKILL.md': instruction })), /限制|大小|100KB/);
      assert.throws(() => buildSkillPackageFromForm({ key: 'small-cap', name: 'Small', summary: '', instruction }), /限制|大小|过大/);
    } finally {
      if (old === undefined) delete process.env.MMP_SKILL_MAX_INSTRUCTION_BYTES; else process.env.MMP_SKILL_MAX_INSTRUCTION_BYTES = old;
    }
  });

  it('rejects duplicate raw names even when an archive writer normally merges duplicates', async () => {
    const archive = await zip({ 'SKILL.md': instruction, 'aa.txt': 'one', 'bb.txt': 'two' });
    const replaced = Buffer.from(archive), from = Buffer.from('bb.txt'), to = Buffer.from('aa.txt');
    for (let at = replaced.indexOf(from); at !== -1; at = replaced.indexOf(from, at + to.length)) to.copy(replaced, at);
    await assert.rejects(parseSkillZip(replaced), /重复|冲突/);
  });

  it('preserves scripts, resources, assets, root helpers and their exact bytes', async () => {
    const files = {
      'SKILL.md': instruction,
      'scripts/run.js': '#!/usr/bin/env node\nconsole.log("ok");\n',
      'references/guide.md': '# Guide',
      'references/examples/SKILL.md': '# An example, not another entry',
      'resources/source.txt': 'source',
      'assets/data.bin': Buffer.from([0, 255, 1, 200]),
      'templates/output.html': '<h1>result</h1>',
      'helper.js': 'export const marker = "helper";',
      'LICENSE': 'MIT',
      'package.zip': Buffer.from('a bundled asset named package.zip'),
    };
    const parsed = await parseSkillZip(await zip(files, 'scripts/run.js'));
    for (const [name, value] of Object.entries(files)) assert.deepEqual(parsed.files.get(name), Buffer.from(value));
    assert.equal(parsed.files.size, 10);
    assert.equal(parsed.manifest.packageFormat, 2);
    assert.equal(parsed.manifest.description, 'Read the guide\nand execute the script.');
    assert.equal(parsed.manifest.files?.find(f => f.path === 'scripts/run.js')?.executable, true);
    assert.equal(parsed.manifest.files?.find(f => f.path === 'assets/data.bin')?.sha256,
      createHash('sha256').update(Buffer.from([0, 255, 1, 200])).digest('hex'));
    assert.equal(parsed.manifest.files?.length, 10);
    assert.equal(parsed.files.has('skill.json'), false);
  });

  it('preserves native and foreign skill.json even when the platform key changes', async () => {
    for (const metadata of [
      '{ "vendor": "upstream", "settings": { "key": "local" } }',
      '{ "key":"native-key", "name":"Native", "description":"Original", "entry":"SKILL.md" }',
    ]) {
      const parsed = await parseSkillZip(await zip({ 'SKILL.md': instruction, 'skill.json': metadata }));
      retargetPackageKey(parsed, 'new-platform-key');
      assert.equal(parsed.files.get('skill.json')?.toString(), metadata);
      assert.equal(parsed.manifest.key, 'new-platform-key');
    }
    await assert.rejects(parseSkillZip(await zip({
      'SKILL.md': instruction,
      'skill.json': '{"key":"INVALID KEY", "name":"Name", "description":"Body"}',
    })), /标识/);
  });

  it('accepts a binary asset larger than the former 1MiB reference cap', async () => {
    const asset = Buffer.alloc(1024 * 1024 + 1, 13);
    const parsed = await parseSkillZip(await zip({ 'SKILL.md': instruction, 'assets/font.woff2': asset }));
    assert.deepEqual(parsed.files.get('assets/font.woff2'), asset);
  });

  it('rejects links, dependency directories, case conflicts and file/directory conflicts', async () => {
    const link = new JSZip();
    link.file('SKILL.md', instruction);
    link.file('assets/link', '/etc/passwd', { unixPermissions: 0o120777 });
    await assert.rejects(parseSkillZip(await link.generateAsync({ type: 'nodebuffer', platform: 'UNIX' })), /链接|特殊文件/);
    for (const files of [
      { 'node_modules/thing/index.js': 'package' },
      { '.git/config': 'private' },
      { 'assets/Name.txt': 'A', 'assets/name.txt': 'B' },
      { 'assets/name': 'file', 'assets/name/child': 'conflict' },
      { 'assets/CON.txt': 'Windows reserved' },
    ]) await assert.rejects(parseSkillZip(await zip({ 'SKILL.md': instruction, ...files })), /依赖|仓库|冲突|路径/);
  });

  it('rejects raw traversal before a ZIP library can normalize it', async () => {
    const archive = await zip({ 'SKILL.md': instruction, 'aa/source.txt': 'bad' });
    const replaced = Buffer.from(archive);
    // Equal-length replacement in both local and central names preserves the ZIP layout.
    const from = Buffer.from('aa/source.txt'), to = Buffer.from('../source.txt');
    for (let offset = replaced.indexOf(from); offset !== -1; offset = replaced.indexOf(from, offset + to.length)) to.copy(replaced, offset);
    await assert.rejects(parseSkillZip(replaced), /路径|损坏/);
  });

  it('keeps expanded package.zip separate from the original upload archive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-storage-')); roots.push(root);
    const previous = process.env.UPLOAD_DIR; process.env.UPLOAD_DIR = root;
    try {
      const archive = await zip({ 'SKILL.md': instruction, 'package.zip': 'bundled file' });
      const parsed = await parseSkillZip(archive);
      const stored = await writeSkillPackageToDisk('test-skill', 1, parsed, archive);
      assert.equal(await readFile(join(root, stored.storagePath, 'package.zip'), 'utf8'), 'bundled file');
      assert.deepEqual(await readFile(join(root, stored.sourceZipPath!)), archive);
      assert.notEqual(join(root, stored.storagePath, 'package.zip'), join(root, stored.sourceZipPath!));
    } finally {
      if (previous === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = previous;
    }
  });

  it('accepts more than 50 files and rejects an expanded package over 10MiB', async () => {
    const files: Record<string, string | Buffer> = { 'SKILL.md': instruction };
    for (let i = 0; i < 70; i++) files[`references/${i}.txt`] = 'reference';
    assert.equal((await parseSkillZip(await zip(files))).files.size, 71);
    await assert.rejects(parseSkillZip(await zip({ 'SKILL.md': instruction, 'assets/large.bin': Buffer.alloc(10 * 1024 * 1024) })), /10MB|容量|大小/);
  });
});
