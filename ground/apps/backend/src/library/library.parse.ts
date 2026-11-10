import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { PDFParse } from 'pdf-parse';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileExtension } from './library.files';
import { convertLegacyOffice } from './library.office-convert';
import { presentationText, workbookText } from './library.office-text';
import { recognizeImageText } from './library.ocr';
import type { ParseChunk, ParseResult } from './library.types';

const MAX_EXTRACT_CHARS = 200_000;
const MAX_XML_BYTES = 16 * 1024 * 1024;
const CHUNK_CHARS = 1_500;
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'];
const VIDEO_REASON = '仅保存：不做视频理解，不能供 AI 引用';
const IMAGE_REASON = '没有读出可引用的文字，仅保存原图';
const ZIP_LIST_LIMIT = 40;
const ZIP_ENTRY_BYTES = 8 * 1024 * 1024;
const ZIP_TOTAL_BYTES = 20 * 1024 * 1024;
const ZIP_CHUNK_LIMIT = 400;
const ZIP_EMPTY = '压缩包里没有可引用的文字，仅保存原件';
const EXECUTABLE_EXTENSIONS = new Set(['.exe', '.dll', '.so', '.dylib', '.sh', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1', '.app', '.command', '.jar']);
const ZIP_CITABLE = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.md', '.markdown', '.txt', '.csv', '.html', '.htm',
  ...IMAGE_EXTENSIONS,
]);

export type ZipEntry = { name: string; size: number };

/** Parse supported documents. A zip is read one level deep and never executed. */
export async function parseLibraryBytes(name: string, bytes: Buffer): Promise<ParseResult> {
  const ext = fileExtension(name);
  try {
    if (VIDEO_EXTENSIONS.includes(ext)) return downloadOnly(VIDEO_REASON);
    if (IMAGE_EXTENSIONS.includes(ext)) {
      const text = await recognizeImageText(name, bytes);
      return text ? textChunks(text) : downloadOnly(IMAGE_REASON);
    }
    if (ext === '.zip') return await parseZip(bytes);
    if (ext === '.pdf') {
      const parsed = await parsePdf(bytes);
      if (parsed.status !== 'DOWNLOAD_ONLY') return parsed;
      const text = await recognizeImageText(name, bytes);
      return text ? textChunks(text) : parsed;
    }
    if (ext === '.docx') return await parseDocx(bytes);
    if (ext === '.pptx') return textChunks(await presentationText(bytes));
    if (ext === '.xlsx') return textChunks(await workbookText(bytes));
    if (ext === '.doc' || ext === '.ppt' || ext === '.xls') {
      const converted = await convertLegacyOffice(bytes, ext);
      if (!converted) return downloadOnly('这台机器没有 Office 转换程序，老版文件仅下载');
      const next = ext === '.doc' ? '.docx' : ext === '.ppt' ? '.pptx' : '.xlsx';
      return parseLibraryBytes(`converted${next}`, converted);
    }
    if (ext === '.html' || ext === '.htm') return textChunks(htmlToText(bytes.toString('utf8')));
    if (['.md', '.markdown', '.txt', '.csv'].includes(ext)) return textChunks(bytes.toString('utf8'));
    return downloadOnly('该类型本期不能解析');
  } catch {
    return { status: 'FAILED', reason: '解析失败：文档损坏、受保护或展开后过大，可以重试', truncated: false, chunks: [] };
  }
}

function downloadOnly(reason: string): ParseResult {
  return { status: 'DOWNLOAD_ONLY', reason, truncated: false, chunks: [] };
}

/** Return plain text only. The preview must never render this as HTML. */
export function htmlToText(raw: string): string {
  return decodeEntities(raw.replace(/<(script|style|noscript|iframe)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function decodeEntities(text: string): string {
  return text.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (all, value: string) => {
      const n = value[0].toLowerCase() === 'x' ? Number.parseInt(value.slice(1), 16) : Number(value);
      return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    });
}

/** Stable paragraph locators; splitting long paragraphs preserves their locator. */
export function textChunks(raw: string): ParseResult {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\0/g, '').trim();
  if (!normalized) return { status: 'FAILED', reason: '没有可提取的文字', truncated: false, chunks: [] };
  const truncated = normalized.length > MAX_EXTRACT_CHARS;
  const chunks: ParseChunk[] = [];
  normalized.slice(0, MAX_EXTRACT_CHARS).split(/\n{2,}/).map(x => x.trim()).filter(Boolean).forEach((part, i) => {
    for (let start = 0; start < part.length; start += CHUNK_CHARS) {
      chunks.push({ ordinal: chunks.length, content: part.slice(start, start + CHUNK_CHARS), locator: `paragraph:${i + 1}`, locatorKind: 'paragraph' });
    }
  });
  return { status: 'READY', reason: truncated ? '仅提取前部分文字，未读完全文' : null, truncated, chunks };
}

async function parsePdf(bytes: Buffer): Promise<ParseResult> {
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('invalid PDF');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    const chunks: ParseChunk[] = [];
    let used = 0;
    let truncated = false;
    for (const page of result.pages) {
      const raw = page.text.replace(/\0/g, '').trim();
      if (!raw) continue;
      if (used >= MAX_EXTRACT_CHARS) { truncated = true; break; }
      const text = raw.slice(0, MAX_EXTRACT_CHARS - used);
      truncated ||= text.length < raw.length;
      used += text.length;
      for (let start = 0; start < text.length; start += CHUNK_CHARS) {
        chunks.push({ ordinal: chunks.length, content: text.slice(start, start + CHUNK_CHARS), locator: `page:${page.num}`, locatorKind: 'page' });
      }
    }
    if (!chunks.length) return downloadOnly('没有可提取的文字，扫描件 OCR 后置');
    return { status: 'READY', reason: truncated ? '仅提取前部分文字，未读完全文' : null, truncated, chunks };
  } finally { await parser.destroy(); }
}

async function parseDocx(bytes: Buffer): Promise<ParseResult> {
  const archive = await JSZip.loadAsync(bytes);
  const entry = archive.file('word/document.xml');
  if (!entry) throw new Error('missing body');
  const buffers: Buffer[] = [];
  let size = 0;
  await pipeline(entry.nodeStream('nodebuffer'), new Writable({
    write(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      if (size > MAX_XML_BYTES) return done(new Error('expanded document too large'));
      buffers.push(chunk); done();
    },
  }));
  const source = Buffer.concat(buffers).toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('external entities forbidden');
  const parser = new XMLParser({ preserveOrder: true, parseTagValue: false, trimValues: false });
  const output: string[] = [];
  const visit = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'w:t' && Array.isArray(value)) {
          for (const item of value) if (typeof item['#text'] === 'string') output.push(item['#text']);
        } else { visit(value); if (key === 'w:p') output.push('\n\n'); }
      }
    }
  };
  visit(parser.parse(source));
  return textChunks(output.join(''));
}

/** Names and declared sizes only. This does not inflate entry bytes. */
export async function listZipEntries(bytes: Buffer): Promise<{ entries: ZipEntry[]; truncated: boolean }> {
  const archive = await JSZip.loadAsync(bytes);
  const rows: ZipEntry[] = [];
  for (const file of Object.values(archive.files)) {
    const entry = listedZipEntry(file);
    if (entry) rows.push(entry);
  }
  rows.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return { entries: rows.slice(0, ZIP_LIST_LIMIT), truncated: rows.length > ZIP_LIST_LIMIT };
}

async function parseZip(bytes: Buffer): Promise<ParseResult> {
  const archive = await JSZip.loadAsync(bytes);
  const listed = Object.values(archive.files).flatMap((file) => {
    const entry = listedZipEntry(file);
    return entry ? [{ file, ...entry }] : [];
  }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const visible = listed.slice(0, ZIP_LIST_LIMIT);
  let truncated = listed.length > ZIP_LIST_LIMIT;
  const chunks: ParseChunk[] = [];
  let total = 0;
  for (const entry of visible) {
    const ext = fileExtension(entry.name);
    if (ext === '.zip' || EXECUTABLE_EXTENSIONS.has(ext) || !ZIP_CITABLE.has(ext)) continue;
    if (entry.size > ZIP_ENTRY_BYTES || total + entry.size > ZIP_TOTAL_BYTES) {
      truncated = true;
      continue;
    }
    total += entry.size;
    let inner: ParseResult;
    try {
      const content = Buffer.from(await entry.file.async('nodebuffer'));
      if (content.length > ZIP_ENTRY_BYTES) {
        truncated = true;
        continue;
      }
      inner = await parseLibraryBytes(entry.name, content);
    } catch {
      continue;
    }
    if (inner.status !== 'READY') continue;
    truncated ||= inner.truncated;
    for (const chunk of inner.chunks) {
      if (chunks.length >= ZIP_CHUNK_LIMIT) {
        truncated = true;
        break;
      }
      chunks.push({
        ordinal: chunks.length,
        content: chunk.content,
        locator: `${entry.name} ${chunk.locator}`.slice(0, 500),
        locatorKind: chunk.locatorKind,
      });
    }
  }
  if (!chunks.length) return downloadOnly(truncated ? '压缩包只列出部分文件，里面没有可引用的文字' : ZIP_EMPTY);
  return { status: 'READY', reason: truncated ? '仅提取压缩包中的部分文字' : null, truncated, chunks };
}

function listedZipEntry(file: JSZip.JSZipObject): ZipEntry | null {
  if (file.dir) return null;
  const name = zipDisplayPath(file.unsafeOriginalName ?? file.name);
  const size = zipDeclaredSize(file);
  if (!name || size === null) return null;
  return { name, size };
}

function zipDisplayPath(raw: string): string | null {
  const text = raw.replace(/\\/g, '/').replace(/\0/g, '');
  if (!text || text.startsWith('/') || /^[A-Za-z]:/.test(text)) return null;
  const parts = text.split('/');
  if (!parts.length || parts.some((part) => part === '' || part === '.' || part === '..')) return null;
  const name = parts.join('/');
  return name.length > 240 ? null : name;
}

function zipDeclaredSize(file: JSZip.JSZipObject): number | null {
  const size = (file as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) return null;
  return size;
}
