import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { PDFParse } from 'pdf-parse';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 80;
const EMBED_DIM = 64;

const MAX_XML_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_CHARS = 400_000;
const xml = new XMLParser({ preserveOrder: true, parseTagValue: false, trimValues: false });

export async function extractText(originalName: string, buffer: Buffer) {
  const name = originalName.toLowerCase();
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return buffer.toString('utf8').replace(/\0/g, '').trim().slice(0, MAX_TEXT_CHARS);
  }
  if (name.endsWith('.pdf')) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      return (await parser.getText()).text.replace(/\0/g, '').trim().slice(0, MAX_TEXT_CHARS);
    } finally {
      await parser.destroy();
    }
  }
  const docx = name.endsWith('.docx');
  if (!docx && !name.endsWith('.pptx')) throw new Error('不支持此文件类型');
  const archive = await JSZip.loadAsync(buffer);
  const entries = docx
    ? [archive.file('word/document.xml')].filter((entry) => entry !== null)
    : archive.file(/^ppt\/slides\/slide\d+\.xml$/).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  const paragraphs: string[] = [];
  let remaining = MAX_XML_BYTES;
  for (const entry of entries) {
    const chunks: Buffer[] = [];
    await pipeline(entry.nodeStream('nodebuffer'), new Writable({
      write(chunk: Buffer, _encoding, done) {
        remaining -= chunk.length;
        if (remaining < 0) return done(new Error('文档展开后过大'));
        chunks.push(chunk);
        done();
      },
    }));
    const source = Buffer.concat(chunks).toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('不支持外部实体');
    collectText(xml.parse(source), docx ? 'w' : 'a', paragraphs);
    paragraphs.push('\n');
  }
  return paragraphs.join('').trim().slice(0, MAX_TEXT_CHARS);
}

function collectText(nodes: unknown, prefix: string, output: string[]) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === prefix + ':t' && Array.isArray(value)) {
        for (const item of value) if (typeof item['#text'] === 'string') output.push(item['#text']);
      } else {
        collectText(value, prefix, output);
        if (key === prefix + ':p') output.push('\n');
      }
    }
  }
}

export function chunkText(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + CHUNK_SIZE);
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks.filter(Boolean);
}

export function embedText(text: string) {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  const compact = text.replace(/\s+/g, '');
  if (!compact) return vec;
  for (let i = 0; i < compact.length - 1; i += 1) {
    vec[hash32(compact.slice(i, i + 2)) % EMBED_DIM] += 1;
  }
  let norm = 0;
  for (const n of vec) norm += n * n;
  const scale = Math.sqrt(norm) || 1;
  return vec.map((n) => n / scale);
}

export function vectorLiteral(values: number[]) {
  return `[${values.map((n) => n.toFixed(6)).join(',')}]`;
}


function hash32(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
