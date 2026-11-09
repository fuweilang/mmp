import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDisplayTranslationPrompt,
  clipChars,
  displaySourceHash,
  looksEnglishDisplay,
  needsMachineDisplayTranslation,
  parseDisplayTranslationJson,
} from '../../src/official-skill/skill-display-i18n';

describe('skill-display-i18n', () => {
  it('detects english display and preserves cjk', () => {
    assert.equal(looksEnglishDisplay('video-to-keyframes'), true);
    assert.equal(looksEnglishDisplay('视频关键帧提取'), false);
    assert.equal(looksEnglishDisplay('HappyHorse 提示词工作室'), false);
  });

  it('skips manual provenance and stable machine hashes', () => {
    const sourceName = 'spark-video';
    const sourceSummary = 'Runs a video pipeline';
    const hash = displaySourceHash(sourceName, sourceSummary);
    assert.equal(
      needsMachineDisplayTranslation({
        name: '火花视频流水线',
        summary: '一键跑通视频流水线',
        sourceName,
        sourceSummary,
        displayProvenance: 'machine',
        displaySourceHash: hash,
      }),
      false,
    );
    assert.equal(
      needsMachineDisplayTranslation({
        name: sourceName,
        summary: sourceSummary,
        sourceName,
        sourceSummary,
        displayProvenance: 'manual',
        displaySourceHash: hash,
      }),
      false,
    );
    assert.equal(
      needsMachineDisplayTranslation({
        name: sourceName,
        summary: sourceSummary,
        sourceName,
        sourceSummary,
        displayProvenance: 'source',
        displaySourceHash: null,
      }),
      true,
    );
  });

  it('parses model json and clips unicode length', () => {
    const parsed = parseDisplayTranslationJson(
      '```json\n{"name":"视频关键帧","summary":"抽取关键帧并整理"}\n```',
    );
    assert.equal(parsed.name, '视频关键帧');
    assert.equal(clipChars('一二三四五', 3), '一二三');
    assert.match(
      buildDisplayTranslationPrompt({ key: 'a', sourceName: 'A', sourceSummary: 'B' }),
      /技能标识/,
    );
  });
});
