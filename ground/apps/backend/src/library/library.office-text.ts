/** Read text out of PPTX and XLSX packages. Formulas are not evaluated; cached cell values are kept. */
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const MAX_XML_BYTES = 16 * 1024 * 1024;
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
});

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function localName(name: string) {
  const index = name.lastIndexOf(':');
  return index === -1 ? name : name.slice(index + 1);
}

function textNodes(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) return value.map(textNodes).join('');
  let text = '';
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('@_')) continue;
    text += localName(key) === 't' ? textNodes(child) : textNodes(child);
  }
  return text;
}

async function xml(zip: JSZip, path: string): Promise<unknown> {
  const entry = zip.file(path);
  if (!entry) return null;
  const bytes = await entry.async('nodebuffer');
  if (bytes.length > MAX_XML_BYTES) throw new Error('expanded document too large');
  const source = bytes.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('external entities forbidden');
  return parser.parse(source);
}

function slideNumber(path: string) {
  const match = /slide(\d+)\.xml$/i.exec(path);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/** Slide text in slide order, one paragraph per slide. */
export async function presentationText(bytes: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const slides = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b) || a.localeCompare(b));
  const parts: string[] = [];
  for (const path of slides) {
    const text = textNodes(await xml(zip, path)).replace(/\s+/g, ' ').trim();
    if (text) parts.push(text);
  }
  return parts.join('\n\n');
}

function sharedStrings(document: unknown): string[] {
  const root = document && typeof document === 'object' ? document as Record<string, unknown> : {};
  const sst = root.sst ?? root['x:sst'];
  const items = sst && typeof sst === 'object' ? (sst as Record<string, unknown>).si ?? (sst as Record<string, unknown>)['x:si'] : [];
  return asArray(items).map((item) => textNodes(item));
}

function cellValue(cell: Record<string, unknown>, shared: readonly string[]): string {
  const type = String(cell['@_t'] ?? '');
  if (type === 'inlineStr') return textNodes(cell.is ?? cell['x:is']).trim();
  const raw = cell.v ?? cell['x:v'];
  const value = raw === undefined || raw === null ? '' : String(raw).trim();
  if (!value) return '';
  if (type === 's') return shared[Number(value)] ?? '';
  return value;
}

function sheetText(document: unknown, shared: readonly string[], name: string): string {
  const root = document && typeof document === 'object' ? document as Record<string, unknown> : {};
  const worksheet = (root.worksheet ?? root['x:worksheet']) as Record<string, unknown> | undefined;
  const data = worksheet?.sheetData ?? worksheet?.['x:sheetData'];
  const rows = asArray(data && typeof data === 'object' ? (data as Record<string, unknown>).row ?? (data as Record<string, unknown>)['x:row'] : []);
  const lines: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const cells = asArray(record.c ?? record['x:c']).map((cell) => cell && typeof cell === 'object' ? cellValue(cell as Record<string, unknown>, shared) : '');
    const line = cells.map((cell) => cell.replace(/[\t\r\n]+/g, ' ').trim()).filter(Boolean).join('\t');
    if (line) lines.push(line);
  }
  if (!lines.length) return '';
  return name ? `${name}\n${lines.join('\n')}` : lines.join('\n');
}

function sheetOrder(workbook: unknown, rels: unknown): { name: string; path: string }[] {
  const root = workbook && typeof workbook === 'object' ? workbook as Record<string, unknown> : {};
  const book = (root.workbook ?? root['x:workbook']) as Record<string, unknown> | undefined;
  const sheets = asArray(book?.sheets && typeof book.sheets === 'object' ? (book.sheets as Record<string, unknown>).sheet ?? (book.sheets as Record<string, unknown>)['x:sheet'] : []);
  const relRoot = rels && typeof rels === 'object' ? rels as Record<string, unknown> : {};
  const relationships = relRoot.Relationships as Record<string, unknown> | undefined;
  const byId = new Map<string, string>();
  for (const rel of asArray(relationships?.Relationship)) {
    if (!rel || typeof rel !== 'object') continue;
    const record = rel as Record<string, unknown>;
    const id = String(record['@_Id'] ?? '');
    const target = String(record['@_Target'] ?? '');
    if (id && target) byId.set(id, target.replace(/^\/?xl\//, ''));
  }
  const ordered: { name: string; path: string }[] = [];
  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== 'object') continue;
    const record = sheet as Record<string, unknown>;
    const target = byId.get(String(record['@_r:id'] ?? record['@_id'] ?? ''));
    if (!target) continue;
    ordered.push({ name: String(record['@_name'] ?? ''), path: `xl/${target.replace(/^\//, '')}` });
  }
  return ordered;
}

/** Cell text in workbook order. Formula expressions are omitted. */
export async function workbookText(bytes: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const shared = sharedStrings(await xml(zip, 'xl/sharedStrings.xml'));
  let sheets = sheetOrder(await xml(zip, 'xl/workbook.xml'), await xml(zip, 'xl/_rels/workbook.xml.rels'));
  if (!sheets.length) {
    sheets = Object.keys(zip.files)
      .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
      .sort()
      .map((path) => ({ name: '', path }));
  }
  const parts: string[] = [];
  for (const sheet of sheets) {
    const text = sheetText(await xml(zip, sheet.path), shared, sheet.name);
    if (text) parts.push(text);
  }
  return parts.join('\n\n');
}
