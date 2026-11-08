import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { PDFParse } from 'pdf-parse';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileExtension } from './library.files';
import type { ParseChunk, ParseResult } from './library.types';

const MAX_EXTRACT_CHARS = 200_000;
const MAX_XML_BYTES = 16 * 1024 * 1024;
const CHUNK_CHARS = 1_500;
const DOWNLOAD_REASON: Record<string, string> = {
  '.zip': '压缩包只供下载，不自动解压，也不能用于问答',
  '.ppt': '演示文稿本期仅下载', '.pptx': '演示文稿本期仅下载',
  '.xls': '表格本期仅下载，不做精确计算', '.xlsx': '表格本期仅下载，不做精确计算',
  '.doc': '老版 Word 本期仅下载',
};

/** Parse supported documents without executing HTML, Office macros or ZIP contents. */
export async function parseLibraryBytes(name: string, bytes: Buffer): Promise<ParseResult> {
  const ext = fileExtension(name);
  try {
    if (['.png','.jpg','.jpeg','.gif','.webp','.avif','.mp4','.webm','.mov'].includes(ext)) return downloadOnly('仅保存：支持预览或下载，不进行图片识别、OCR 或视频理解，不能供 AI 引用');
    if (DOWNLOAD_REASON[ext]) return downloadOnly(DOWNLOAD_REASON[ext]);
    if (ext === '.pdf') return await parsePdf(bytes);
    if (ext === '.docx') return await parseDocx(bytes);
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
