/// <reference lib="es2022.intl" />
import { createHash } from 'node:crypto';
import { countTokens, DEFAULT_TOKEN_COUNTER } from './tokenizer';
import type { ChunkingOptions, KnowledgeChunkInput, SourceLocator, TextSection } from './types';

export const DEFAULT_CHUNKING_OPTIONS = { targetTokens: 600, maxTokens: 900, overlapTokens: 80 } as const;

function lowerBound(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sorted[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Pure, bounded-window splitting. Source ranges include original whitespace, never the repeated header. */
export function chunkSections(sections: readonly TextSection[], options: ChunkingOptions = {}): KnowledgeChunkInput[] {
  const { targetTokens, maxTokens, overlapTokens } = { ...DEFAULT_CHUNKING_OPTIONS, ...options };
  for (const value of [targetTokens, maxTokens, overlapTokens]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Token options must be nonnegative safe integers');
  }
  if (targetTokens < 1 || maxTokens < targetTokens) throw new Error('Target token count must be positive and <= max tokens');
  if (overlapTokens >= targetTokens) throw new Error('Overlap tokens must be less than target tokens');
  const counter = options.tokenCounter ?? DEFAULT_TOKEN_COUNTER;
  const result: KnowledgeChunkInput[] = [];
  let documentOffset = 0;
  for (const section of sections) {
    const text = section.text;
    const base = section.sourceOffset ?? documentOffset;
    if (!Number.isSafeInteger(base) || base < 0 || !Number.isSafeInteger(base + text.length)) throw new Error('Invalid source offset');
    documentOffset = base + text.length;
    if (!text.trim()) continue;
    const header = section.tableHeader ? `${section.tableHeader}\n` : '';
    const headerTokens = header ? countTokens(header, counter) : 0;
    if (headerTokens >= maxTokens) throw new Error('Table header cannot fit token budget');

    // Build offsets once; all tokenization below only sees bounded local windows.
    const offsets = [0];
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const { segment } of segmenter.segment(text)) offsets.push(offsets[offsets.length - 1] + segment.length);
    const last = offsets.length - 1;
    const paragraphStarts = section.paragraphOffsets?.map(entry => entry.offset) ?? [];
    const newlines = Array.from(text.matchAll(/\n/g), match => match.index!);
    const boundaries = section.tableHeader
      ? newlines.map(offset => offset + 1)
      : Array.from(text.matchAll(/\n[\t \r]*\n/g), match => match.index! + match[0].length);
    if (section.tableHeader && boundaries[boundaries.length - 1] !== text.length) boundaries.push(text.length);
    const headings: { offset: number; path: string[] }[] = [];
    let headingPath = [...(section.headingPath ?? section.locator.headingPath ?? [])];
    if (!section.tableHeader) {
      for (const match of text.matchAll(/^(#{1,6})[\t ]+(.+?)[\t ]*#*[\t ]*\r?$/gm)) {
        const level = match[1].length;
        headingPath = [...headingPath.slice(0, level - 1), match[2].trim()];
        headings.push({ offset: match.index!, path: [...headingPath] });
      }
    }
    const headingEnds = [...headings.map(h => h.offset), text.length];
    const paragraphEnds = [...boundaries, text.length];
    let sentenceEnds: number[] | undefined, wordEnds: number[] | undefined;
    const sentences = () => sentenceEnds ??= Array.from(new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text), s => s.index + s.segment.length);
    const words = () => wordEnds ??= Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text), s => s.index + s.segment.length);
    let start = 0;
    let covered = 0;
    let headingIndex = -1;
    let oversizedRowEnd = 0;
    while (start < last) {
      while (headingIndex + 1 < headings.length && headings[headingIndex + 1].offset <= offsets[start]) headingIndex++;
      const nextHeading = section.softHeadingBoundaries ? text.length : headings[headingIndex + 1]?.offset ?? text.length;
      let ceiling = Math.min(last, start + maxTokens * 8, lowerBound(offsets, nextHeading));
      const countTo = (end: number) => countTokens(header + text.slice(offsets[start], offsets[end]), counter);
      let end = start;
      if (section.tableHeader) {
        if (offsets[start] >= oversizedRowEnd) {
          let rowIndex = lowerBound(boundaries, offsets[start] + 1);
          const rowEnd = boundaries[rowIndex];
          const rowEndIndex = lowerBound(offsets, rowEnd);
          // The target is only a preference: a complete row that fits max must remain intact.
          if (countTo(rowEndIndex) <= maxTokens) {
            end = rowEndIndex;
            while (rowIndex + 1 < boundaries.length && countTo(end) < targetTokens) {
              const candidate = lowerBound(offsets, boundaries[++rowIndex]);
              if (candidate > start + maxTokens * 8) break;
              if (countTo(candidate) > targetTokens) break;
              end = candidate;
            }
          } else {
            // Measure an oversized row once; its fragments use bounded windows until this fence.
            oversizedRowEnd = rowEnd;
          }
        }
        if (end === start) ceiling = Math.min(ceiling, lowerBound(offsets, oversizedRowEnd));
      }
      let low = start + 1;
      let high = Math.max(low, ceiling);
      if (end === start) {
        const preferredBudget = section.tableHeader && headerTokens >= targetTokens ? maxTokens : targetTokens;
        while (low <= high) {
          const mid = low + Math.floor((high - low) / 2);
          if (countTo(mid) <= preferredBudget) { end = mid; low = mid + 1; }
          else high = mid - 1;
        }
      }
      // One grapheme may exceed the target, but must still fit the hard maximum.
      if (end === start) {
        end = start + 1;
        if (countTo(end) > maxTokens) throw new Error('A source character cannot fit max token budget');
      }
      if (!section.tableHeader) {
        const preferredEnd = end;
        const fence = lowerBound(offsets, nextHeading);
        // A complete chapter/remainder is preferable to cutting it only to hit target.
        if (fence <= ceiling && countTo(fence) <= maxTokens) end = fence;
        else {
          const choose = (points: readonly number[]): number | undefined => {
            const at = lowerBound(points, offsets[preferredEnd] + 1);
            const candidates = [points[at - 1], points[at]];
            let best: number | undefined, distance = Infinity;
            for (const point of candidates) {
              if (point === undefined || point <= offsets[start] || point > nextHeading) continue;
              const candidate = lowerBound(offsets, point);
              if (candidate > ceiling || candidate <= covered) continue;
              const tokens = countTo(candidate);
              if (tokens > maxTokens) continue;
              if (point < offsets[preferredEnd] && tokens < targetTokens / 2) {
                const following = points[at];
                // Leaving a shorter chunk is better than breaking the next intact unit.
                if (following === undefined || following > offsets[Math.min(last, candidate + maxTokens * 8)]
                  || countTokens(header + text.slice(point, following), counter) > maxTokens) continue;
              }
              const score = Math.abs(tokens - targetTokens);
              if (score <= distance) { best = candidate; distance = score; }
            }
            return best;
          };
          // Smaller units are considered only when the enclosing unit cannot fit.
          const levels = [...(section.softHeadingBoundaries ? [() => headingEnds] : []), () => paragraphEnds, sentences, words];
          let dropOverlap = false;
          for (const level of levels) {
            const points = level(), semantic = choose(points);
            if (semantic !== undefined) { end = semantic; break; }
            const point = points[lowerBound(points, offsets[covered] + 1)];
            if (start < covered && point !== undefined && point <= nextHeading
              && point <= offsets[Math.min(last, covered + maxTokens * 8)]
              && countTokens(header + text.slice(offsets[covered], point), counter) <= maxTokens) {
              dropOverlap = true; break;
            }
          }
          // Do not sacrifice a complete next unit just to retain optional overlap.
          if (dropOverlap) { start = covered; continue; }
        }
      }
      // An unusual injected counter must never make overlapping windows stop progressing.
      if (end <= covered) { start = covered; continue; }
      const sourceText = text.slice(offsets[start], offsets[end]);
      const rendered = header + sourceText;
      const tokenCount = countTokens(rendered, counter);
      if (tokenCount > maxTokens) throw new Error('Source chunk exceeds max token budget');
      const locator: SourceLocator = { ...section.locator };
      if (section.paragraphOffsets?.length) {
        const firstText = offsets[start] + Math.max(0, sourceText.search(/\S/));
        const paragraphIndex = lowerBound(paragraphStarts, firstText + 1) - 1;
        if (paragraphIndex >= 0) {
          locator.paragraph = section.paragraphOffsets[paragraphIndex].paragraph;
          const lastText = offsets[start] + sourceText.trimEnd().length - 1;
          const lastParagraphIndex = lowerBound(paragraphStarts, lastText + 1) - 1;
          const lastParagraph = section.paragraphOffsets[lastParagraphIndex]?.paragraph;
          if (lastParagraph !== undefined && lastParagraph > locator.paragraph) locator.paragraphEnd = lastParagraph;
        }
      }
      const path = headings[headingIndex]?.path ?? section.headingPath ?? section.locator.headingPath;
      if (path) locator.headingPath = [...path];
      if (section.softHeadingBoundaries) {
        const paths: string[][] = [];
        if (path?.length) paths.push([...path]);
        for (let i = headingIndex + 1; i < headings.length && headings[i].offset < offsets[end]; i++) {
          if (headings[i].offset >= offsets[start]) paths.push([...headings[i].path]);
        }
        if (paths.length) {
          const seenPaths = new Set<string>();
          locator.headingPaths = paths.filter(p => { const key = JSON.stringify(p); if (seenPaths.has(key)) return false; seenPaths.add(key); return true; });
          const common = [...paths[0]];
          for (const p of paths.slice(1)) { let n=0; while(n<common.length && n<p.length && common[n]===p[n]) n++; common.length=n; }
          locator.headingPath = common;
        }
      }
      if (section.tableHeader && section.locator.rowStart !== undefined) {
        locator.rowStart = section.locator.rowStart + lowerBound(newlines, offsets[start]);
        locator.rowEnd = section.locator.rowStart + lowerBound(newlines, offsets[end] - 1);
      }
      result.push({
        ordinal: result.length, text: rendered, sourceText, tokenCount, tokenizer: counter.encoding,
        contentHash: createHash('sha256').update(rendered).digest('hex'),
        sourceStart: base + offsets[start], sourceEnd: base + offsets[end], locator,
      });
      covered = end;
      if (end === last) break;
      // Tables keep complete row groups; do not duplicate row locators with overlap.
      if (section.tableHeader || offsets[end] === nextHeading || overlapTokens === 0) { start = end; continue; }
      low = Math.max(start + 1, end - overlapTokens * 8);
      high = end;
      let nextStart = end;
      while (low <= high) {
        const mid = low + Math.floor((high - low) / 2);
        if (countTokens(text.slice(offsets[mid], offsets[end]), counter) <= overlapTokens) {
          nextStart = mid; high = mid - 1;
        } else low = mid + 1;
      }
      // Overlap is a ceiling, not a reason to start halfway through a sentence.
      // Prefer whole heading/paragraph units, then complete sentences; omit overlap
      // when none fits. The main source range still progresses without any gap.
      const align = (points: readonly number[]): number | undefined => {
        for (let i = lowerBound(points, offsets[nextStart]); i < points.length && points[i] < offsets[end]; i++) {
          const candidate = lowerBound(offsets, points[i]);
          if (candidate > start && countTokens(text.slice(offsets[candidate], offsets[end]), counter) <= overlapTokens) return candidate;
        }
        return undefined;
      };
      start = (section.softHeadingBoundaries ? align(headingEnds) : undefined)
        ?? align(paragraphEnds) ?? align(sentences()) ?? end;
    }
  }
  return result;
}
