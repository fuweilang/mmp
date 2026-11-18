import { extname } from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import JSZip from 'jszip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { PDFParse } from 'pdf-parse';
import { parse } from 'csv-parse/sync';
import type { TextSection } from './types';

export const KNOWLEDGE_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
export const knowledgeUploadLimit = (name:string) => extname(name).toLowerCase() === '.pdf' ? KNOWLEDGE_UPLOAD_MAX_BYTES : 20 * 1024 * 1024;
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
const localName = (name: string) => {
  const index = name.lastIndexOf(':');
  return index === -1 ? name : name.slice(index + 1);
};
const orderedParser = new XMLParser({
  preserveOrder: true,
  parseTagValue: false,
  trimValues: false,
  ignoreAttributes: false,
});
const sheetParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: false,
});
const MAX_SHEET_COLUMNS = 256;

/** Stream one Office XML part. The byte budget is shared by every part of one package. */
function officeXmlReader(maxXmlBytes: number) {
  let expanded = 0;
  return async (file: JSZip.JSZipObject) => {
    const buffers: Buffer[] = [];
    await pipeline(
      file.nodeStream('nodebuffer'),
      new Writable({
        write(chunk: Buffer, _enc, done) {
          expanded += chunk.length;
          if (expanded > maxXmlBytes) return done(new ExtractionLimit());
          buffers.push(chunk);
          done();
        },
      }),
    );
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(buffers),
    );
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
      throw new Error('invalid XML');
    return xml;
  };
}

function orderedText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (!Array.isArray(node)) return '';
  return node
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      return Object.entries(item as Record<string, unknown>)
        .map(([key, value]) => {
          if (key === ':@') return '';
          if (key === '#text') return String(value);
          const name = localName(key);
          if (name === 'tab') return '\t';
          if (name === 'br') return '\n';
          return orderedText(value);
        })
        .join('');
    })
    .join('');
}

/** Slide body paragraphs only. Notes, pictures and charts stay out of the text. */
function slideParagraphs(node: unknown, out: string[]): void {
  if (!Array.isArray(node)) return;
  for (const item of node) {
    if (!item || typeof item !== 'object') continue;
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
      if (key === ':@' || key === '#text') continue;
      if (localName(key) === 'p') {
        const text = clean(orderedText(value)).trim();
        if (text) out.push(text);
      } else slideParagraphs(value, out);
    }
  }
}

function numberedPart(path: string, kind: 'slide' | 'sheet') {
  const match = new RegExp(`${kind}(\\d+)\\.xml$`, 'i').exec(path);
  const n = match ? Number(match[1]) : Number.NaN;
  return Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function plainText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) return value.map(plainText).join('');
  let text = '';
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('@_')) continue;
    text += plainText(child);
  }
  return text;
}

function sharedStrings(document: unknown): string[] {
  const root =
    document && typeof document === 'object'
      ? (document as Record<string, unknown>)
      : {};
  const sst = root.sst ?? root['x:sst'];
  const items =
    sst && typeof sst === 'object'
      ? ((sst as Record<string, unknown>).si ??
        (sst as Record<string, unknown>)['x:si'])
      : [];
  return asArray(items).map((item) => plainText(item));
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0];
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
    if (n > MAX_SHEET_COLUMNS) return MAX_SHEET_COLUMNS;
  }
  return n - 1;
}

/** Cached cell values only. A formula with no cached value contributes nothing. */
function cellValue(cell: Record<string, unknown>, shared: readonly string[]): string {
  const type = String(cell['@_t'] ?? '');
  if (type === 'inlineStr') return plainText(cell.is ?? cell['x:is']).trim();
  const raw = cell.v ?? cell['x:v'];
  const value = raw === undefined || raw === null ? '' : String(raw).trim();
  if (!value) return '';
  if (type === 's') {
    const index = Number(value);
    return Number.isSafeInteger(index) ? (shared[index] ?? '') : '';
  }
  return value;
}

function sheetRows(
  document: unknown,
  shared: readonly string[],
  markTruncated: () => void,
): { row: number; cells: Map<number, string> }[] {
  const root =
    document && typeof document === 'object'
      ? (document as Record<string, unknown>)
      : {};
  const worksheet = (root.worksheet ?? root['x:worksheet']) as
    | Record<string, unknown>
    | undefined;
  const data = worksheet?.sheetData ?? worksheet?.['x:sheetData'];
  const rows = asArray(
    data && typeof data === 'object'
      ? ((data as Record<string, unknown>).row ??
        (data as Record<string, unknown>)['x:row'])
      : [],
  );
  const parsed: { row: number; cells: Map<number, string> }[] = [];
  let fallback = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    fallback += 1;
    const rowNumber = Number(record['@_r']);
    const cells = new Map<number, string>();
    let nextCol = 0;
    for (const cell of asArray(record.c ?? record['x:c'])) {
      if (!cell || typeof cell !== 'object') continue;
      const item = cell as Record<string, unknown>;
      const fromRef = columnIndex(String(item['@_r'] ?? ''));
      const col = fromRef >= 0 ? fromRef : nextCol;
      nextCol = col + 1;
      if (col >= MAX_SHEET_COLUMNS) {
        markTruncated();
        continue;
      }
      const text = cellValue(item, shared).replace(/[\t\r\n]+/g, ' ').trim();
      if (text) cells.set(col, text);
    }
    if (cells.size)
      parsed.push({
        row: Number.isSafeInteger(rowNumber) && rowNumber > 0 ? rowNumber : fallback,
        cells,
      });
  }
  return parsed;
}

function renderRow(cells: Map<number, string>, columns: number[]): string {
  const rendered = columns.map((col) =>
    (cells.get(col) ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/\|/g, '\\|'),
  );
  while (rendered.length && !rendered[rendered.length - 1]) rendered.pop();
  return rendered.join(' | ');
}

function worksheetPath(target: string): string | undefined {
  const relative = target
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^xl\//, '');
  if (relative.includes('..') || !/^worksheets\/sheet\d+\.xml$/i.test(relative))
    return undefined;
  return `xl/${relative}`;
}

function sheetOrder(
  workbook: unknown,
  rels: unknown,
): { name: string; path: string }[] {
  const root =
    workbook && typeof workbook === 'object'
      ? (workbook as Record<string, unknown>)
      : {};
  const book = (root.workbook ?? root['x:workbook']) as
    | Record<string, unknown>
    | undefined;
  const sheets = asArray(
    book?.sheets && typeof book.sheets === 'object'
      ? ((book.sheets as Record<string, unknown>).sheet ??
        (book.sheets as Record<string, unknown>)['x:sheet'])
      : [],
  );
  const relRoot =
    rels && typeof rels === 'object' ? (rels as Record<string, unknown>) : {};
  const relationships = relRoot.Relationships as Record<string, unknown> | undefined;
  const byId = new Map<string, string>();
  for (const rel of asArray(relationships?.Relationship)) {
    if (!rel || typeof rel !== 'object') continue;
    const record = rel as Record<string, unknown>;
    const id = String(record['@_Id'] ?? '');
    const path = worksheetPath(String(record['@_Target'] ?? ''));
    if (id && path) byId.set(id, path);
  }
  const ordered: { name: string; path: string }[] = [];
  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== 'object') continue;
    const record = sheet as Record<string, unknown>;
    const path = byId.get(String(record['@_r:id'] ?? record['@_id'] ?? ''));
    if (!path) continue;
    ordered.push({
      name: String(record['@_name'] ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200),
      path,
    });
  }
  return ordered;
}

type SectionAdder = (
  text: string,
  locator: TextSection['locator'],
  tableHeader?: string,
) => void;

async function parseSlides(
  archive: JSZip,
  readXml: (file: JSZip.JSZipObject) => Promise<string>,
  add: SectionAdder,
  truncated: () => boolean,
): Promise<'ok' | 'xml-limit'> {
  const slides = Object.keys(archive.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => numberedPart(a, 'slide') - numberedPart(b, 'slide') || a.localeCompare(b));
  for (const path of slides) {
    if (truncated()) return 'ok';
    const entry = archive.file(path);
    if (!entry) continue;
    let xml: string;
    try {
      xml = await readXml(entry);
    } catch (e) {
      if (e instanceof ExtractionLimit) return 'xml-limit';
      throw e;
    }
    const paragraphs: string[] = [];
    slideParagraphs(orderedParser.parse(xml), paragraphs);
    if (!paragraphs.length) continue;
    const page = numberedPart(path, 'slide');
    add(paragraphs.join('\n'), {
      ...(page < Number.MAX_SAFE_INTEGER ? { page } : {}),
    });
  }
  return 'ok';
}

async function parseSheets(
  archive: JSZip,
  readXml: (file: JSZip.JSZipObject) => Promise<string>,
  add: SectionAdder,
  truncated: () => boolean,
  markTruncated: () => void,
): Promise<'ok' | 'xml-limit'> {
  const read = async (path: string) => {
    const entry = archive.file(path);
    if (!entry) return undefined;
    return sheetParser.parse(await readXml(entry));
  };
  let shared: string[] = [];
  let sheets: { name: string; path: string }[] = [];
  try {
    const strings = await read('xl/sharedStrings.xml');
    if (strings) shared = sharedStrings(strings);
    const book = archive.file('xl/workbook.xml');
    if (book)
      sheets = sheetOrder(
        sheetParser.parse(await readXml(book)),
        await read('xl/_rels/workbook.xml.rels'),
      );
  } catch (e) {
    if (e instanceof ExtractionLimit) return 'xml-limit';
    throw e;
  }
  if (!sheets.length) {
    sheets = Object.keys(archive.files)
      .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
      .sort((a, b) => numberedPart(a, 'sheet') - numberedPart(b, 'sheet') || a.localeCompare(b))
      .map((path) => ({ name: '', path }));
  }
  for (const sheet of sheets) {
    if (truncated()) return 'ok';
    const entry = archive.file(sheet.path);
    if (!entry) continue;
    let rows: ReturnType<typeof sheetRows>;
    try {
      rows = sheetRows(sheetParser.parse(await readXml(entry)), shared, markTruncated);
    } catch (e) {
      if (e instanceof ExtractionLimit) return 'xml-limit';
      throw e;
    }
    if (!rows.length) continue;
    const columns = [
      ...new Set(rows.flatMap((row) => [...row.cells.keys()])),
    ].sort((a, b) => a - b);
    const header = renderRow(rows[0].cells, columns);
    const locatorBase = sheet.name ? { headingPath: [sheet.name] } : {};
    if (rows.length === 1) {
      add(`${header}\n`, { ...locatorBase, rowStart: rows[0].row, rowEnd: rows[0].row });
      continue;
    }
    const tableHeader = sheet.name ? `${sheet.name}\n${header}` : header;
    for (const row of rows.slice(1)) {
      if (truncated()) return 'ok';
      const line = renderRow(row.cells, columns);
      if (!line.trim()) continue;
      add(`${line}\n`, { ...locatorBase, rowStart: row.row, rowEnd: row.row }, tableHeader);
    }
  }
  return 'ok';
}
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
  if (!bytes.length || bytes.length > knowledgeUploadLimit(name))
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
    softHeadingBoundaries = false,
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
      ...(softHeadingBoundaries ? { softHeadingBoundaries: true } : {}),
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
          add(ext === '.txt' ? text.slice(group.start, group.end) : text, group.locator, undefined, ext === '.txt' ? undefined : group.paragraphs, ext !== '.txt');
          group = undefined;
        };
        for (const match of text.matchAll(/[^\n]+(?:\n(?!\n)[^\n]+)*/g)) {
          paragraph++;
          const entryHeadingPath = [...headingPath];
          // Markdown is packed by Token budget; headings are retained as soft boundaries.
          if (group && ext === '.txt') flush();
          if (truncated || sections.length >= maxSections || used >= maxChars) { truncated = true; break; }
          if (!group) group = { start: match.index!, end: match.index!, locator: { paragraph, ...(entryHeadingPath.length ? { headingPath: entryHeadingPath } : {}) }, paragraphs: [] };
          group.end = match.index! + match[0].length;
          group.paragraphs.push({ offset: ext === '.txt' ? match.index! - group.start : match.index!, paragraph });
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
      const readXml = officeXmlReader(maxXmlBytes);
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
      let group: { text: string; locator: TextSection['locator']; paragraphs: NonNullable<TextSection['paragraphOffsets']> } | undefined;
      const flushGroup = () => {
        if (group) add(group.text, group.locator, undefined, group.paragraphs);
        group = undefined;
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
              if (level !== undefined && level < 9 && text.trim()) {
                flushGroup();
                headingPath = [...headingPath.slice(0, level), text.trim()];
              }
              if (text.trim()) {
                if (!group) group = { text: '', locator: { paragraph, ...(headingPath.length ? { headingPath: [...headingPath] } : {}) }, paragraphs: [] };
                if (group.text) group.text += '\n\n';
                group.paragraphs.push({ offset: group.text.length, paragraph });
                group.text += text;
                if (group.text.length >= maxChars - used) flushGroup();
              }
            } else visit(value);
            if (truncated) return;
          }
      };
      visit(nodes);
      flushGroup();
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
    } else if (ext === '.pptx' || ext === '.xlsx') {
      const archive = await JSZip.loadAsync(bytes);
      const readXml = officeXmlReader(maxXmlBytes);
      const outcome =
        ext === '.pptx'
          ? await parseSlides(archive, readXml, add, () => truncated)
          : await parseSheets(archive, readXml, add, () => truncated, () => {
              truncated = true;
            });
      if (outcome === 'xml-limit')
        return {
          status: 'PARTIAL',
          sections,
          truncated: true,
          reason: sections.length ? 'EXTRACTION_LIMIT' : 'EXPANDED_XML_LIMIT',
        };
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
