import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseSkillZip, packagePreview, writeSkillPackageToDisk } from '../../src/official-skill/skill-package';
import { OfficialSkillService } from '../../src/official-skill/official-skill.service';

async function main() {
 const [archivePath, output] = process.argv.slice(2); if (!archivePath || !output) throw Error('Usage: uploaded-package.probe.ts <archive.zip> <handoff.json>');
 const bytes = await readFile(archivePath), archiveSha256 = createHash('sha256').update(bytes).digest('hex');
 const root = await mkdtemp(join(tmpdir(), 'mmp-uploaded-skill-')), previous = process.env.UPLOAD_DIR; process.env.UPLOAD_DIR = root;
 try {
  const parsed = await parseSkillZip(bytes), stored = await writeSkillPackageToDisk('uploaded-package', 1, parsed, bytes);
  const pkg = { revision: 1, storagePath: stored.storagePath, manifest: parsed.manifest };
  const row = { id: 'uploaded-package', key: parsed.manifest.key, name: parsed.manifest.name, summary: parsed.manifest.description, enabledAt: new Date(), deletedAt: null, currentRevision: 1, currentPackage: pkg, packages: [pkg] };
  const prisma = { officialSkill: { findUnique: async () => row } };
  const service = new OfficialSkillService(prisma as never, {} as never), content = await service.publicContent(row.id, 1, 2);
  assert.deepEqual(content.files, parsed.manifest.files);
  const data: Record<string, string> = {};
  for (const file of parsed.manifest.files!) {
   const resource = await service.publicResource(row.id, file.path, 1);
   try { const actual = await readFile(resource.abs); assert.deepEqual(actual, parsed.files.get(file.path)); assert.equal(createHash('sha256').update(actual).digest('hex'), file.sha256); data[file.path] = actual.toString('base64'); }
   finally { resource.stream.destroy(); }
  }
  assert.deepEqual(await readFile(join(root, stored.sourceZipPath!)), bytes);
  const report = { archiveSha256, archiveBytes: bytes.length, preview: packagePreview(parsed), files: parsed.manifest.files, packageDigest: parsed.manifest.packageDigest, resourceCountVerified: Object.keys(data).length, originalArchivePreserved: true, packageScriptsExecutedDuringImport: false };
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify({ report, content, data }));
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
 } finally { if (previous === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = previous; await rm(root, { recursive: true, force: true }); }
}
void main();
