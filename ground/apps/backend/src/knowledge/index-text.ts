const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 80;
const EMBED_DIM = 64;

export function extractText(originalName: string, buffer: Buffer) {
  const lower = originalName.toLowerCase();
  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    return stripNul(buffer.toString('utf8'));
  }
  if (lower.endsWith('.docx')) {
    return extractTagged(buffer.toString('utf8'), /<w:t[^>]*>([^<]*)<\/w:t>/g);
  }
  if (lower.endsWith('.pdf')) {
    return extractPdfLike(buffer);
  }
  return readableRuns(buffer.toString('utf8'));
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

function extractTagged(raw: string, pattern: RegExp) {
  const parts: string[] = [];
  for (const match of raw.matchAll(pattern)) {
    if (match[1]) parts.push(match[1]);
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function extractPdfLike(buffer: Buffer) {
  const raw = buffer.toString('latin1');
  const fromParens = [...raw.matchAll(/\((?:\\.|[^\\)]){4,}\) /g)]
    .map((m) => m[0].slice(1, -1).replace(/\\[nrt]/g, ' '))
    .join(' ');
  const merged = `${fromParens} ${readableRuns(raw)}`;
  return merged.replace(/\s+/g, ' ').trim();
}

function readableRuns(raw: string) {
  const matches = raw.match(/[\u4e00-\u9fffA-Za-z0-9，。；、：？！“”‘’（）()《》\s]{8,}/g);
  return (matches ?? []).join('\n').replace(/[^\S\n]+/g, ' ').trim();
}

function stripNul(text: string) {
  return text.replace(/\u0000/g, '').trim();
}

function hash32(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
