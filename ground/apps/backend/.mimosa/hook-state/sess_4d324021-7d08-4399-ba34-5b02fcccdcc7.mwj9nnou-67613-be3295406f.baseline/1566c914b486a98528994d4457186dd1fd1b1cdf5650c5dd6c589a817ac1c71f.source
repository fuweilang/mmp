import { extname } from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import JSZip from 'jszip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { PDFParse } from 'pdf-parse';
import { parse } from 'csv-parse/sync';
import type { TextSection } from './types';

export const KNOWLEDGE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export interface ExtractionLimits {
  maxChars?: number;
  maxXmlBytes?: number;
  maxSections?: number;
  maxPdfPages?: number;
}
export interface KnowledgeParseResult {
  status: 'READY' | 'PARTIAL' | 'DOWNLOAD_ONLY' | 'FAILED';
  sections: TextSection[];
  truncated: boolean;
  reason?: string;
}
class ExtractionLimit extends Error {}
const clean = (s: string) => s.replace(/\r\n?/g, '\n').replace(/\0/g, '');
/** Extracted offsets are UTF-16 offsets in canonical extracted text, never original binary offsets. */
export async function parseKnowledgeBytes(
  name: string,
  bytes: Buffer,
  limits: ExtractionLimits = {},
): Promise<KnowledgeParseResult> {
  const maxChars = limits.maxChars ?? 1_000_000,
    maxXmlBytes = limits.maxXmlBytes ?? 16 * 1024 * 1024;
  const maxSections = limits.maxSections ?? 20_000,
    maxPdfPages = limits.maxPdfPages ?? 500;
  if (
    [maxChars, maxXmlBytes, maxSections, maxPdfPages].some(
      (n) => !Number.isSafeInteger(n) || n < 1,
    )
  )
    throw new Error('Invalid extraction limits');
  if (!bytes.length || bytes.length > KNOWLEDGE_UPLOAD_MAX_BYTES)
    return {
      status: 'FAILED',
      sections: [],
      truncated: false,
      reason: 'UPLOAD_SIZE_LIMIT',
    };
  const sections: TextSection[] = [];
  let used = 0,
    truncated = false;
  const add = (
    text: string,
    locator: TextSection['locator'],
    tableHeader?: string,
    paragraphOffsets?: TextSection['paragraphOffsets'],
  ) => {
    if (!text.trim()) return;
    if (sections.length >= maxSections || used >= maxChars) {
      truncated = true;
      return;
    }
    let part = text.slice(0, maxChars - used);
    if (part.length < text.length) {
      truncated = true;
      if (/[\uD800-\uDBFF]$/.test(part)) part = part.slice(0, -1);
    }
    sections.push({
      text: part,
      sourceOffset: used,
      locator,
      ...(tableHeader ? { tableHeader } : {}),
      ...(paragraphOffsets ? { paragraphOffsets: paragraphOffsets.filter(entry => entry.offset < part.length) } : {}),
    });
    used += part.length;
  };
  try {
    const ext = extname(name).toLowerCase();
    if (['.txt', '.md', '.markdown', '.csv'].includes(ext)) {
      const text = clean(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
      if (ext === '.csv') {
        let row = 0,
          header = '';
        // Escape embedded newline cells in canonical display text, so each section remains one logical row.
        const render = (cells: string[]) =>
          cells
            .map((v) =>
              v
                .replace(/\\/g, '\\\\')
                .replace(/\n/g, '\\n')
                .replace(/\|/g, '\\|'),
            )
            .join(' | ');
        try {
          parse(text, {
            bom: true,
            max_record_size: Math.min(maxChars, 1_000_000),
            on_record: (cells: string[]) => {
              row++;
              if (row === 1) {
                header = render(cells);
                if (header.length > maxChars) throw new ExtractionLimit();
                return null;
              }
              if (used >= maxChars || sections.length >= maxSections)
                throw new ExtractionLimit();
              add(render(cells) + '\n', { rowStart: row, rowEnd: row }, header);
              return null;
            },
          });
        } catch (e) {
          if (
            e instanceof ExtractionLimit ||
            (e as { code?: string }).code === 'CSV_MAX_RECORD_SIZE'
          )
            truncated = true;
          else throw e;
        }
      } else {
        let paragraph = 0;
        let headingPath: string[] = [];
        let group: { start: number; end: number; locator: TextSection['locator']; paragraphs: NonNullable<TextSection['paragraphOffsets']> } | undefined;
        const flush = () => {
          if (!group) return;
          add(text.slice(group.start, group.end), group.locator, undefined, ext === '.txt' ? undefined : group.paragraphs);
          group = undefined;
        };
        for (const match of text.matchAll(/[^\n]+(?:\n(?!\n)[^\n]+)*/g)) {
          paragraph++;
          const entryHeadingPath = [...headingPath];
          // A short method's heading and body form one semantic section; the chunker owns its token bound.
          if (group && (ext === '.txt' || /^#{1,6}[\t ]+/m.test(match[0]))) flush();
          if (truncated || sections.length >= maxSections || used >= maxChars) { truncated = true; break; }
          if (!group) group = { start: match.index!, end: match.index!, locator: { paragraph, ...(entryHeadingPath.length ? { headingPath: entryHeadingPath } : {}) }, paragraphs: [] };
          group.end = match.index! + match[0].length;
          group.paragraphs.push({ offset: match.index! - group.start, paragraph });
          if (ext !== '.txt')
            for (const heading of match[0].matchAll(
              /^(#{1,6})[\t ]+(.+?)[\t ]*#*[\t ]*$/gm,
            ))
              headingPath = [
                ...headingPath.slice(0, heading[1].length - 1),
                heading[2].trim(),
              ];
          if (group.end - group.start > maxChars - used) { flush(); break; }
        }
        flush();
      }
    } else if (ext === '.docx') {
      const archive = await JSZip.loadAsync(bytes);
      const entry = archive.file('word/document.xml');
      if (!entry) throw new Error('missing body');
      let expanded = 0;
      const readXml = async (file: JSZip.JSZipObject) => {
        const buffers: Buffer[] = [];
        await pipeline(file.nodeStream('nodebuffer'), new Writable({
          write(chunk: Buffer, _enc, done) {
            expanded += chunk.length;
            if (expanded > maxXmlBytes) return done(new ExtractionLimit());
            buffers.push(chunk); done();
          },
        }));
        const xml = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(buffers));
        if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('invalid XML');
        return xml;
      };
      let xml: string, stylesXml: string | undefined;
      try {
        xml = await readXml(entry);
        const styles = archive.file('word/styles.xml');
        if (styles) stylesXml = await readXml(styles);
      } catch (e) {
        if (e instanceof ExtractionLimit) return { status: 'PARTIAL', sections: [], truncated: true, reason: 'EXPANDED_XML_LIMIT' };
        throw e;
      }
      const nodes: unknown = new XMLParser({preserveOrder:true,parseTagValue:false,trimValues:false,ignoreAttributes:false}).parse(xml);
      const styles = new Map<string, {parent?: string; level?: number}>();
      const levelOf = (value: unknown): number | undefined => {
        const n = typeof value === 'string' && /^[0-9]$/.test(value) ? Number(value) : -1;
        return n >= 0 && n <= 9 ? n : undefined;
      };
      if (stylesXml) {
        const tree = new XMLParser({ignoreAttributes:false,parseAttributeValue:false}).parse(stylesXml);
        const rows = tree['w:styles']?.['w:style'];
        for (const row of rows ? Array.isArray(rows) ? rows : [rows] : []) {
          if (typeof row['@_w:styleId'] === 'string') styles.set(row['@_w:styleId'], {
            parent: row['w:basedOn']?.['@_w:val'], level: levelOf(row['w:pPr']?.['w:outlineLvl']?.['@_w:val']),
          });
        }
      }
      const styleLevel = (id: string | undefined): number | undefined => {
        const seen = new Set<string>();
        while (id && !seen.has(id) && seen.size < 32) {
          seen.add(id);
          const style = styles.get(id);
          if (style?.level !== undefined) return style.level;
          const heading = /^Heading([1-9])$/i.exec(id);
          if (heading) return Number(heading[1]) - 1;
          id = style?.parent;
        }
        return undefined;
      };
      const attribute = (node: unknown, tag: string): string | undefined => {
        if (!Array.isArray(node)) return undefined;
        for (const row of node) {
          if (tag in row) return row[':@']?.['@_w:val'];
          for (const value of Object.values(row)) { const found = attribute(value, tag); if (found !== undefined) return found; }
        }
        return undefined;
      };
      let headingPath: string[] = [];
      let paragraph = 0;
      const textOf = (node: unknown): string => {
        if (!Array.isArray(node)) return '';
        return node
          .map((item) =>
            Object.entries(item as Record<string, unknown>)
              .map(([key, value]) =>
                key === '#text'
                  ? String(value)
                  : key === 'w:tab'
                    ? '\t'
                    : key === 'w:br'
                      ? '\n'
                      : textOf(value),
              )
              .join(''),
          )
          .join('');
      };
      const visit = (node: unknown): void => {
        if (!Array.isArray(node)) return;
        for (const item of node)
          for (const [key, value] of Object.entries(
            item as Record<string, unknown>,
          )) {
            if (key === 'w:p') {
              paragraph++;
              const text = clean(textOf(value));
              const level = levelOf(attribute(value, 'w:outlineLvl')) ?? styleLevel(attribute(value, 'w:pStyle'));
              if (level !== undefined && level < 9 && text.trim()) headingPath = [...headingPath.slice(0, level), text.trim()];
              add(text, { paragraph, ...(headingPath.length ? {headingPath: [...headingPath]} : {}) });
            } else visit(value);
            if (truncated) return;
          }
      };
      visit(nodes);
    } else if (ext === '.pdf') {
      if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-')
        throw new Error('invalid PDF');
      const parser = new PDFParse({ data: new Uint8Array(bytes) });
      try {
        const info = await parser.getInfo();
        for (let n = 1; n <= Math.min(info.total, maxPdfPages); n++) {
          const page = await parser.getText({ partial: [n] });
          for (const item of page.pages)
            add(clean(item.text), { page: item.num });
          if (truncated) break;
        }
        if (info.total > maxPdfPages) truncated = true;
      } finally {
        await parser.destroy();
      }
    } else
      return {
        status: 'DOWNLOAD_ONLY',
        sections: [],
        truncated: false,
        reason: 'UNSUPPORTED_DOCUMENT',
      };
    if (truncated)
      return {
        status: 'PARTIAL',
        sections,
        truncated: true,
        reason: 'EXTRACTION_LIMIT',
      };
    return sections.length
      ? { status: 'READY', sections, truncated: false }
      : {
          status: 'DOWNLOAD_ONLY',
          sections: [],
          truncated: false,
          reason: 'NO_EXTRACTABLE_TEXT',
        };
  } catch {
    return {
      status: 'FAILED',
      sections: [],
      truncated: false,
      reason: 'DOCUMENT_PARSE_FAILED',
    };
  }
}
