import { createHash } from 'node:crypto';
import { SKILL_NAME_MAX_CHARS, SKILL_SUMMARY_MAX_CHARS } from './skill-package';

export type DisplayProvenance = 'source' | 'machine' | 'manual';

export function displaySourceHash(sourceName: string, sourceSummary: string): string {
  return createHash('sha256').update(`${sourceName}\n${sourceSummary}`, 'utf8').digest('hex');
}

/** Latin-letter heavy and no CJK — treat as needing zh display fill. */
export function looksEnglishDisplay(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/[\u4e00-\u9fff]/.test(t)) return false;
  return /[A-Za-z]{3,}/.test(t);
}

export function clipChars(text: string, max: number): string {
  const chars = [...String(text || '').trim()];
  return chars.length <= max ? chars.join('') : chars.slice(0, max).join('').trim();
}

export function needsMachineDisplayTranslation(row: {
  name: string;
  summary: string;
  sourceName: string | null;
  sourceSummary: string;
  displayProvenance: string;
  displaySourceHash: string | null;
}): boolean {
  if (row.displayProvenance === 'manual') return false;
  const sourceName = (row.sourceName ?? row.name).trim();
  const sourceSummary = (row.sourceSummary || row.summary || '').trim();
  const hash = displaySourceHash(sourceName, sourceSummary);
  if (row.displayProvenance === 'machine' && row.displaySourceHash === hash) {
    // Re-run only if display still looks English (failed/partial prior fill).
    return looksEnglishDisplay(row.name) || looksEnglishDisplay(row.summary);
  }
  return looksEnglishDisplay(row.name) || looksEnglishDisplay(row.summary) || looksEnglishDisplay(sourceName) || looksEnglishDisplay(sourceSummary);
}

export function buildDisplayTranslationPrompt(input: { key: string; sourceName: string; sourceSummary: string }): string {
  return [
    '你是技能目录本地化助手。把下列技能的【展示名称】和【用途简介】译成简体中文，供用户浏览。',
    '硬性要求：',
    '1. 只翻译给人看的名称与简介；不要发明工具能力，不要改写执行逻辑。',
    '2. 保留产品名、API、模型名、品牌名等专有名词（可加简短中文说明）。',
    '3. 名称尽量短、像应用卡片标题；简介一句话说明用途。',
    `4. 名称不超过 ${SKILL_NAME_MAX_CHARS} 个字符，简介不超过 ${SKILL_SUMMARY_MAX_CHARS} 个字符（按 Unicode 字符计）。`,
    '5. 只输出一个 JSON 对象，键为 name、summary，不要 Markdown 围栏，不要其它文字。',
    `技能标识(key，勿翻译): ${input.key}`,
    `原名称: ${input.sourceName}`,
    `原简介: ${input.sourceSummary || '（空）'}`,
  ].join('\n');
}

export function parseDisplayTranslationJson(raw: string): { name: string; summary: string } {
  const text = String(raw || '').trim();
  const fenced = text.match(/\{[\s\S]*\}/);
  const body = fenced ? fenced[0] : text;
  const parsed = JSON.parse(body) as { name?: unknown; summary?: unknown };
  if (typeof parsed.name !== 'string' || !parsed.name.trim()) throw new Error('翻译结果缺少 name');
  if (typeof parsed.summary !== 'string') throw new Error('翻译结果缺少 summary');
  return {
    name: clipChars(parsed.name, SKILL_NAME_MAX_CHARS),
    summary: clipChars(parsed.summary, SKILL_SUMMARY_MAX_CHARS),
  };
}
