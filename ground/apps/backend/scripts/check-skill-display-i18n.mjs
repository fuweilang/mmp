import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');
const result = spawnSync('pnpm', ['exec', 'tsx', '-e', `
import assert from 'node:assert/strict';
import {
  buildDisplayTranslationPrompt,
  displaySourceHash,
  looksEnglishDisplay,
  needsMachineDisplayTranslation,
  parseDisplayTranslationJson,
  clipChars,
} from './src/official-skill/skill-display-i18n.ts';
assert.equal(looksEnglishDisplay('video-to-keyframes'), true);
assert.equal(looksEnglishDisplay('视频关键帧提取'), false);
assert.equal(looksEnglishDisplay('HappyHorse 提示词工作室'), false);
const sourceName='spark-video', sourceSummary='Runs a video pipeline';
const hash=displaySourceHash(sourceName, sourceSummary);
assert.equal(needsMachineDisplayTranslation({name:'火花视频流水线',summary:'一键跑通视频流水线',sourceName,sourceSummary,displayProvenance:'machine',displaySourceHash:hash}), false);
assert.equal(needsMachineDisplayTranslation({name:sourceName,summary:sourceSummary,sourceName,sourceSummary,displayProvenance:'manual',displaySourceHash:hash}), false);
assert.equal(needsMachineDisplayTranslation({name:sourceName,summary:sourceSummary,sourceName,sourceSummary,displayProvenance:'source',displaySourceHash:null}), true);
const parsed=parseDisplayTranslationJson('\`\`\`json\\n{"name":"视频关键帧","summary":"抽取关键帧并整理"}\\n\`\`\`');
assert.equal(parsed.name,'视频关键帧');
assert.equal(clipChars('一二三四五',3),'一二三');
assert.match(buildDisplayTranslationPrompt({key:'a',sourceName:'A',sourceSummary:'B'}),/技能标识/);
console.log(JSON.stringify({ok:true,checks:7}));
`], { cwd: backendRoot, encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
