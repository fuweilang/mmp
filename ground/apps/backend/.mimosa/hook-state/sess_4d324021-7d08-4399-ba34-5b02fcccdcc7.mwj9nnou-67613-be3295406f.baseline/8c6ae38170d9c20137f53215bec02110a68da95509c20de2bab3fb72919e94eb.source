import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import JSZip from 'jszip';
import {
  isIgnorableZipPath,
  parseSkillZip,
  readSkillFrontmatter,
  slugSkillKey,
} from '../../src/official-skill/skill-package';

async function zip(files: Record<string, string | Buffer>) {
  const archive = new JSZip();
  for (const [path, data] of Object.entries(files)) archive.file(path, data);
  return archive.generateAsync({ type: 'nodebuffer' });
}

const skillMd = `---
name: Meeting Notes
description: Turn notes into actions
license: Apache-2.0
---
# Meeting Notes

Keep the original English steps.
`;

describe('skill zip import', () => {
  it('reads root SKILL.md without skill.json and keeps license text', async () => {
    const parsed = await parseSkillZip(await zip({ 'SKILL.md': skillMd }));
    assert.equal(parsed.keyDerived, true);
    assert.equal(parsed.manifest.key, 'meeting-notes');
    assert.equal(parsed.manifest.name, 'Meeting Notes');
    assert.equal(parsed.manifest.description, 'Turn notes into actions');
    assert.equal(parsed.manifest.license, 'Apache-2.0');
    assert.match(parsed.instruction, /original English steps/);
    assert.equal(parsed.manifest.entry, 'SKILL.md');
    assert.equal(parsed.files.has('skill.json'), false);
  });

  it('unwraps one outer directory and ignores Mac junk', async () => {
    const parsed = await parseSkillZip(await zip({
      'My Skill/SKILL.md': '# Folder Skill\n\nDo the work.\n',
      'My Skill/references/LICENSE.txt': 'MIT',
      '__MACOSX/My Skill/._SKILL.md': 'junk',
      '.DS_Store': 'junk',
      '._hidden': 'junk',
    }));
    assert.equal(parsed.manifest.name, 'Folder Skill');
    assert.equal(parsed.files.has('references/LICENSE.txt'), true);
    assert.equal([...parsed.files.keys()].some((path) => path.includes('MACOSX') || path.endsWith('.DS_Store')), false);
  });

  it('keeps an existing skill.json key and does not treat the package as derived', async () => {
    const parsed = await parseSkillZip(await zip({
      'skill.json': JSON.stringify({
        key: 'brief-pack',
        name: 'Brief',
        description: 'Original summary',
        entry: 'SKILL.md',
        license: 'MIT',
        source: 'example.com/brief',
      }),
      'SKILL.md': '# Brief\n\nBody stays English.\n',
    }));
    assert.equal(parsed.keyDerived, false);
    assert.equal(parsed.manifest.key, 'brief-pack');
    assert.equal(parsed.manifest.license, 'MIT');
    assert.equal(parsed.manifest.source, 'example.com/brief');
    assert.match(parsed.instruction, /Body stays English/);
  });

  it('names corrupt, missing, empty and multiple-entry archives', async () => {
    await assert.rejects(parseSkillZip(Buffer.from('not-a-zip')), /已损坏/);
    await assert.rejects(parseSkillZip(await zip({ 'readme.txt': 'hello' })), /缺少 SKILL.md/);
    await assert.rejects(parseSkillZip(await zip({ 'SKILL.md': '   \n' })), /内容为空/);
    await assert.rejects(parseSkillZip(await zip({
      'a/SKILL.md': '# A\n\nOne.\n',
      'b/SKILL.md': '# B\n\nTwo.\n',
    })), /多个 SKILL.md/);
    const dataOnly = await parseSkillZip(await zip({ 'SKILL.md': '# Ok\n\nBody.\n', 'run.exe': 'ordinary asset' }));
    assert.equal(dataOnly.files.get('run.exe')?.toString(), 'ordinary asset');
  });

  it('rejects unsafe paths instead of accepting the archive', async () => {
    await assert.rejects(parseSkillZip(await zip({ 'SKILL.md': '# X\n\nBody.\n', '/etc/passwd': 'nope' })), /不安全路径/);
    assert.equal(isIgnorableZipPath('__MACOSX/foo/._SKILL.md'), true);
    assert.equal(slugSkillKey('会议纪要'), null);
    assert.equal(slugSkillKey('Meeting Notes'), 'meeting-notes');
    assert.equal(readSkillFrontmatter(skillMd).description, 'Turn notes into actions');
  });

  it('reads both category and categories from skill.json and caps at 3', async () => {
    const parsed = await parseSkillZip(await zip({
      'skill.json': JSON.stringify({
        key: 'multi-cat',
        name: 'Multi',
        description: 'Has several categories',
        entry: 'SKILL.md',
        category: 'education',
        categories: ['education', 'expertise', 'files'],
      }),
      'SKILL.md': '# Multi\n\nBody.\n',
    }));
    assert.equal(parsed.manifest.category, 'education');
    assert.deepEqual(parsed.manifest.categories, ['education', 'expertise', 'files']);
  });

  it('rejects more than three categories', async () => {
    await assert.rejects(parseSkillZip(await zip({
      'skill.json': JSON.stringify({
        key: 'too-many',
        name: 'Too Many',
        description: 'Overflow',
        entry: 'SKILL.md',
        categories: ['education', 'expertise', 'files', 'search'],
      }),
      'SKILL.md': '# Too Many\n\nBody.\n',
    })), /分类最多 3 个/);
  });
});
