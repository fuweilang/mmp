import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import JSZip from 'jszip';
import { OfficialSkillService } from '../../src/official-skill/official-skill.service';
import { parseSkillZip, writeSkillPackageToDisk } from '../../src/official-skill/skill-package';

let root = '', previous: string | undefined;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'skill-api-')); previous = process.env.UPLOAD_DIR; process.env.UPLOAD_DIR = root; });
afterEach(async () => { if (previous === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = previous; await rm(root, { recursive: true, force: true }); });

async function fixture() {
  const archive = new JSZip();
  const original = '{ "vendor": "upstream", "keep": true }';
  archive.file('SKILL.md', '# Complete\n\nRead references and run scripts.');
  archive.file('scripts/run.js', 'console.log("script");');
  archive.file('assets/config.json', '{"answer":42}');
  archive.file('skill.json', original);
  archive.file(' helper.js', 'spaced');
  archive.file('helper.js', 'plain');
  archive.file(' SKILL.md', 'not the entry');
  const bytes = await archive.generateAsync({ type: 'nodebuffer' });
  const parsed = await parseSkillZip(bytes);
  const storage = await writeSkillPackageToDisk('skill-1', 2, parsed, bytes);
  await mkdir(join(root, 'legacy/references'), { recursive: true });
  await writeFile(join(root, 'legacy/SKILL.md'), '# Old revision');
  await writeFile(join(root, 'legacy/references/guide.md'), '# Guide');
  const legacy = { revision: 1, storagePath: 'legacy', manifest: { references: [{ path: 'references/guide.md' }] } };
  const current = { id: 'pkg-2', revision: 2, storagePath: storage.storagePath, manifest: parsed.manifest, resourceCount: 3, instructionBytes: parsed.instruction.length };
  const row = { id: 'skill-1', key: 'complete', name: 'Display', summary: 'Summary', categories: [],
    sourceName: 'Source', sourceSummary: 'Source summary', currentPackage: current, currentPackageId: current.id,
    currentRevision: 2, packages: [legacy, current], enabledAt: new Date(), deletedAt: null,
    createdAt: new Date(), updatedAt: new Date(), agentLinks: [], discoveryDetail: null, customAvatarPath: null,
  };
  const prisma = {
    officialSkill: { findUnique: async () => row, updateMany: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(row, data); return { count: 1 }; } },
    officialSkillPackage: { update: async ({ data }: { data: { manifest: typeof parsed.manifest } }) => { current.manifest = data.manifest; return current; } },
    auditLog: { create: async () => ({}) },
  };
  return { service: new OfficialSkillService(prisma as never, {} as never), row, parsed, original, storage };
}

describe('complete package resource API', () => {
  it('negotiates v2 explicitly and keeps the exact legacy response for pinned old revisions', async () => {
    const { service, parsed } = await fixture();
    const content = await service.publicContent('skill-1', 2, 2);
    assert.equal(content.packageFormat, 2);
    assert.deepEqual(content.files, parsed.manifest.files);
    assert.equal(content.packageDigest, parsed.manifest.packageDigest);
    await assert.rejects(service.publicContent('skill-1', 2), /更新客户端/);
    assert.deepEqual(await service.publicContent('skill-1', 1), {
      id: 'skill-1', key: 'complete', name: 'Display', summary: 'Summary', packageRevision: 1,
      instruction: '# Old revision', references: [{ path: 'references/guide.md' }],
    });
  });

  it('serves only exact manifest files from the requested revision, including scripts and assets', async () => {
    const { service } = await fixture();
    const resource = await service.publicResource('skill-1', 'scripts/run.js', 2);
    assert.equal(await readFile(resource.abs, 'utf8'), 'console.log("script");');
    resource.stream.destroy();
    for (const path of ['assets/missing', '../SKILL.md', '/scripts/run.js', 'scripts\\run.js', 'scripts/run.js/../run.js']) {
      await assert.rejects(service.publicResource('skill-1', path, 2), /资源不存在/);
    }
    await assert.rejects(service.publicResource('skill-1', 'scripts/run.js', 1), /资源不存在/);
    const old = await service.publicResource('skill-1', 'references/guide.md', 1); old.stream.destroy();
  });

  it('keeps leading spaces distinct through persistence and resource access', async () => {
    const { service } = await fixture();
    for (const [path, expected] of [[' helper.js', 'spaced'], ['helper.js', 'plain'], [' SKILL.md', 'not the entry']]) {
      const resource = await service.publicResource('skill-1', path, 2);
      assert.equal(await readFile(resource.abs, 'utf8'), expected);
      resource.stream.destroy();
    }
    assert.equal((await service.publicContent('skill-1', 2, 2)).instruction, '# Complete\n\nRead references and run scripts.');
  });

  it('updates display metadata without changing uploaded skill.json or the package file identity', async () => {
    const { service, storage, original, parsed } = await fixture();
    const digest = parsed.manifest.packageDigest;
    await service.updateMeta({ id: 'admin' } as never, 'skill-1', { name: 'Renamed', summary: 'New summary' });
    assert.equal(await readFile(join(root, storage.storagePath, 'skill.json'), 'utf8'), original);
    const content = await service.publicContent('skill-1', 2, 2);
    assert.equal(content.packageDigest, digest);
  });
});
