import { inflateRawSync, inflateSync } from 'zlib';
import { fileExtension } from './library.files';
import type { ParseChunk, ParseResult } from './library.types';

const MAX_EXTRACT_CHARS = 200_000;
const CHUNK_CHARS = 1_500;

const DOWNLOAD_REASON: Record<string, string> = {
  '.zip': '压缩包只供下载，不自动解压，也不能当作知识检索',
  '.ppt': '演示文稿本期不能解析，只能下载',
  '.pptx': '演示文稿本期不能解析，只能下载',
  '.xls': '表格本期不能解析，也不能做精确计算，只能下载',
  '.xlsx': '表格本期不能解析，也不能做精确计算，只能下载',
  '.doc': '老版 Word 本期不能解析，只能下载',
};

export function parseLibraryBytes(name: string, bytes: Buffer): ParseResult {
  const ext = fileExtension(name);
  try {
    if (DOWNLOAD_REASON[ext]) return downloadOnly(DOWNLOAD_REASON[ext]);
    if (ext === '.pdf') return parsePdf(bytes);
    if (ext === '.docx') return parseDocx(bytes);
    if (ext === '.html' || ext === '.htm') return textChunks(htmlToText(bytes.toString('utf8')), 'paragraph');
    if (ext === '.md' || ext === '.markdown' || ext === '.txt' || ext === '.csv') {
      return textChunks(bytes.toString('utf8'), 'paragraph');
    }
    return downloadOnly('该类型本期不能解析');
  } catch {
    return { status: 'FAILED', reason: '解析失败，可以重试', truncated: false, chunks: [] };
  }
}

function downloadOnly(reason: string): ParseResult {
  return { status: 'DOWNLOAD_ONLY', reason, truncated: false, chunks: [] };
}

/** 去掉脚本和标签。预览用这段文字，不把 HTML 当页面执行。 */
export function htmlToText(raw: string): string {
  const withoutBlocks = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ');
  const text = withoutBlocks.replace(/<[^>]+>/g, ' ');
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_all, num: string) => String.fromCodePoint(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

export function textChunks(raw: string, kind: 'paragraph' | 'page'): ParseResult {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { status: 'FAILED', reason: '没有可提取的文字', truncated: false, chunks: [] };
  }
  let truncated = false;
  let source = normalized;
  if (source.length > MAX_EXTRACT_CHARS) {
    source = source.slice(0, MAX_EXTRACT_CHARS);
    truncated = true;
  }
  const parts = kind === 'page'
    ? [source]
    : source.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: ParseChunk[] = [];
  parts.forEach((part, index) => {
    const locator = kind === 'page' ? 'page:1' : `paragraph:${index + 1}`;
    for (let offset = 0; offset < part.length; offset += CHUNK_CHARS) {
      chunks.push({
        ordinal: chunks.length,
        content: part.slice(offset, offset + CHUNK_CHARS),
        locator,
        locatorKind: kind === 'page' ? 'page' : 'paragraph',
      });
    }
  });
  return {
    status: 'READY',
    reason: truncated ? '已截取前若干字，未读完全文' : null,
    truncated,
    chunks,
  };
}

function parsePdf(bytes: Buffer): ParseResult {
  if (bytes.length < 5 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { status: 'FAILED', reason: '不是有效的 PDF', truncated: false, chunks: [] };
  }
  const pages = pdfPages(bytes);
  const withText = pages.filter((page) => page.text.trim());
  if (withText.length === 0) {
    return downloadOnly('没有可提取的文字，扫描件 OCR 后置');
  }
  let truncated = false;
  const chunks: ParseChunk[] = [];
  let used = 0;
  for (const page of withText) {
    const text = page.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (used >= MAX_EXTRACT_CHARS) {
      truncated = true;
      break;
    }
    const slice = text.slice(0, MAX_EXTRACT_CHARS - used);
    if (slice.length < text.length) truncated = true;
    used += slice.length;
    for (let offset = 0; offset < slice.length; offset += CHUNK_CHARS) {
      chunks.push({
        ordinal: chunks.length,
        content: slice.slice(offset, offset + CHUNK_CHARS),
        locator: `page:${page.page}`,
        locatorKind: 'page',
      });
    }
  }
  if (chunks.length === 0) return downloadOnly('没有可提取的文字，扫描件 OCR 后置');
  return {
    status: 'READY',
    reason: truncated ? '已截取前若干字，未读完全文' : null,
    truncated,
    chunks,
  };
}

/** 只有页面对象指向的内容流才记页码。散落字符串不算页。 */
export function pdfPages(bytes: Buffer): { page: number; text: string }[] {
  const latin = bytes.toString('latin1');
  const pageRe = /\/Type\s*\/Page(?!s)\b/g;
  const pages: { page: number; text: string }[] = [];
  let match: RegExpExecArray | null;
  let pageNo = 0;
  while ((match = pageRe.exec(latin))) {
    pageNo += 1;
    const window = latin.slice(match.index, match.index + 800);
    const contentIds = [...window.matchAll(/\/Contents\s+(\d+)\s+0\s+R/g)]
      .map((item) => item[1])
      .filter((id): id is string => Boolean(id));
    const texts = contentIds.map((id) => textFromPdfContent(pdfObjectStream(bytes, id) ?? Buffer.alloc(0)));
    const text = texts.join(' ').trim();
    pages.push({ page: pageNo, text });
  }
  return pages;
}

function pdfObjectStream(bytes: Buffer, id: string): Buffer | null {
  const latin = bytes.toString('latin1');
  const marker = new RegExp(`${id}\\s+0\\s+obj[\\s\\S]*?stream\\r?\\n`);
  const found = marker.exec(latin);
  if (!found) return null;
  const start = found.index + found[0].length;
  const end = latin.indexOf('endstream', start);
  if (end < 0) return null;
  let raw = bytes.subarray(start, end);
  if (raw.length && raw[raw.length - 1] === 0x0a) raw = raw.subarray(0, -1);
  if (raw.length && raw[raw.length - 1] === 0x0d) raw = raw.subarray(0, -1);
  const header = latin.slice(found.index, start);
  if (!/\/FlateDecode/.test(header)) return raw;
  try {
    return inflateSync(raw);
  } catch {
    try {
      return inflateRawSync(raw);
    } catch {
      return null;
    }
  }
}

function textFromPdfContent(content: Buffer): string {
  const source = content.toString('latin1');
  const parts: string[] = [];
  for (const item of source.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
    parts.push(decodePdfLiteral(item[0].replace(/\s*Tj$/, '')));
  }
  for (const item of source.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
    for (const inner of item[1].matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      parts.push(decodePdfLiteral(inner[0]));
    }
  }
  return parts.join(' ');
}

function decodePdfLiteral(token: string): string {
  const body = token.trim().replace(/^\(/, '').replace(/\)$/, '');
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = body[i + 1];
    if (next == null) break;
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === '(' || next === ')' || next === '\\') out += next;
    else if (/[0-7]/.test(next)) {
      const octal = body.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] ?? next;
      out += String.fromCharCode(Number.parseInt(octal, 8));
      i += octal.length - 1;
    } else out += next;
    i += 1;
  }
  return out;
}

function parseDocx(bytes: Buffer): ParseResult {
  const entries = readZipEntries(bytes);
  const xml = entries.get('word/document.xml');
  if (!xml) return { status: 'FAILED', reason: 'DOCX 里没有正文', truncated: false, chunks: [] };
  const paragraphs = docxParagraphs(xml.toString('utf8'));
  return textChunks(paragraphs.join('\n\n'), 'paragraph');
}

export function docxParagraphs(xml: string): string[] {
  return xml.split(/<w:p[\s>]/).slice(1).map((part) => {
    const texts = [...part.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((item) => decodeEntities(item[1]));
    return texts.join('');
  }).filter((line) => line.trim());
}

/** 只读取 ZIP 里点名的 XML。用户上传的 ZIP 不会走这里。 */
export function readZipEntries(bytes: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    if (bytes.readUInt32LE(offset) !== 0x04034b50) break;
    const method = bytes.readUInt16LE(offset + 8);
    const compSize = bytes.readUInt32LE(offset + 18);
    const nameLen = bytes.readUInt16LE(offset + 26);
    const extraLen = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = bytes.subarray(nameStart, nameStart + nameLen).toString('utf8');
    const dataStart = nameStart + nameLen + extraLen;
    const comp = bytes.subarray(dataStart, dataStart + compSize);
    if (method === 0) out.set(name, Buffer.from(comp));
    else if (method === 8) out.set(name, inflateRawSync(comp));
    else throw new Error('unsupported zip method');
    offset = dataStart + compSize;
  }
  return out;
}
