import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OfficialSkillService } from '../../src/official-skill/official-skill.service';

let root = '';
let previousUploadDir: string | undefined;

before(() => {
  previousUploadDir = process.env.UPLOAD_DIR;
  root = mkdtempSync(join(tmpdir(), 'mmp-skill-instruction-'));
  process.env.UPLOAD_DIR = root;
});

after(() => {
  if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = previousUploadDir;
  rmSync(root, { recursive: true, force: true });
});

function service() {
  return Object.create(OfficialSkillService.prototype) as OfficialSkillService;
}

describe('admin skill instruction loading', () => {
  it('reads SKILL.md from a legacy package root', async () => {
    mkdirSync(join(root, 'official-skills/legacy/r1'), { recursive: true });
    writeFileSync(join(root, 'official-skills/legacy/r1/SKILL.md'), '# 旧包指令\n');
    assert.equal(await service().readInstructionFromPath('official-skills/legacy/r1'), '# 旧包指令\n');
  });

  it('reads format-2 packages from their content directory', async () => {
    mkdirSync(join(root, 'official-skills/format2/r1/content'), { recursive: true });
    writeFileSync(join(root, 'official-skills/format2/r1/content/SKILL.md'), '# 新包指令\n');
    assert.equal(await service().readInstructionFromPath('official-skills/format2/r1'), '# 新包指令\n');
  });

  it('returns empty instead of blocking the editor when the file is gone', async () => {
    const row = { currentPackage: { storagePath: 'official-skills/missing/r1' } };
    assert.equal(await service().readInstructionIfAny(row as never), '');
  });
});
