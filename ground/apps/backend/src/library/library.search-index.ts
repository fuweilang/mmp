import { Prisma } from '@prisma/client';
import { excerptAround, VIEWABLE_IMAGE_EXTENSIONS } from './library.items';
import { fileExtension } from './library.files';

export type IndexedLibraryHit = {
  nodeId: string;
  versionId: string;
  versionNo: number;
  name: string;
  locator: string;
  locatorKind: 'paragraph' | 'page' | 'image';
  quote: string;
  matched: 'text' | 'name';
  image?: true;
  score: number;
};

type SqlClient = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

type LexicalRow = {
  nodeId: string;
  name: string;
  updatedAt: Date;
  versionId: string;
  versionNo: number;
  parseStatus: string;
  originalName: string;
  summary: string;
  score: number;
};

type ChunkRow = {
  versionId: string;
  locator: string;
  locatorKind: string;
  content: string;
  score: number;
};

const IMAGE_NAME = String.raw`\.(png|jpe?g|gif|webp)$`;

export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export function keywordIsStrong(hits: readonly { score: number }[], termCount: number): boolean {
  return termCount > 0 && (hits[0]?.score ?? 0) >= termCount;
}

export function fuseLibraryHits<T extends { versionId: string }>(keyword: readonly T[], semantic: readonly T[]): T[] {
  const scores = new Map<string, { hit: T; score: number }>();
  const add = (list: readonly T[]) => {
    list.forEach((hit, index) => {
      const rank = 1 / (60 + index);
      const prev = scores.get(hit.versionId);
      if (prev) prev.score += rank;
      else scores.set(hit.versionId, { hit, score: rank });
    });
  };
  add(keyword);
  add(semantic);
  return [...scores.values()].sort((a, b) => b.score - a.score).map((row) => row.hit);
}

export function vectorLiteral(vector: readonly number[]): string | null {
  if (vector.length !== 1024 || vector.some((value) => !Number.isFinite(value))) return null;
  return `[${vector.join(',')}]`;
}

function anyPattern(column: Prisma.Sql, terms: readonly string[]): Prisma.Sql {
  return Prisma.join(terms.map((term) => Prisma.sql`${column} ILIKE ${likePattern(term)} ESCAPE '\\'`), ' OR ');
}

function termScore(text: string, terms: readonly string[]): number {
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term.toLowerCase())).length;
}

function visible(actor: { tenantId: string; userId: string }): Prisma.Sql {
  return Prisma.sql`
    n.tenant_id = ${actor.tenantId}
    AND n.state = 'ACTIVE'
    AND n.kind = 'FILE'
    AND ((n.scope = 'PRIVATE' AND n.owner_user_id = ${actor.userId}) OR n.scope = 'ENTERPRISE')
  `;
}

export async function queryLexical(
  db: SqlClient,
  actor: { tenantId: string; userId: string },
  terms: readonly string[],
): Promise<IndexedLibraryHit[]> {
  if (terms.length === 0) return [];
  const named = await db.$queryRaw<LexicalRow[]>(Prisma.sql`
    SELECT n.id AS "nodeId", n.name, n.updated_at AS "updatedAt",
           v.id AS "versionId", v.version_no AS "versionNo",
           v.parse_status AS "parseStatus", v.original_name AS "originalName",
           COALESCE(v.summary, '') AS summary,
           1 AS score
    FROM library_node n
    JOIN library_version v ON v.id = n.current_version_id
    WHERE ${visible(actor)}
      AND (
        v.parse_status = 'READY'
        OR (v.parse_status = 'DOWNLOAD_ONLY' AND v.original_name ~* ${IMAGE_NAME})
      )
      AND (${anyPattern(Prisma.sql`n.name`, terms)} OR ${anyPattern(Prisma.sql`COALESCE(v.summary, '')`, terms)})
    ORDER BY n.updated_at DESC
    LIMIT 21
  `);
  const chunks = await db.$queryRaw<Array<ChunkRow & { nodeId: string; name: string; updatedAt: Date; versionNo: number; parseStatus: string; originalName: string; summary: string }>>(Prisma.sql`
    SELECT n.id AS "nodeId", n.name, n.updated_at AS "updatedAt",
           v.id AS "versionId", v.version_no AS "versionNo",
           v.parse_status AS "parseStatus", v.original_name AS "originalName",
           COALESCE(v.summary, '') AS summary,
           c.locator, c.locator_kind AS "locatorKind", c.content, 1 AS score
    FROM library_chunk c
    JOIN library_version v ON v.id = c.version_id
    JOIN library_node n ON n.current_version_id = v.id
    WHERE c.tenant_id = ${actor.tenantId}
      AND ${visible(actor)}
      AND v.parse_status = 'READY'
      AND (${anyPattern(Prisma.sql`c.content`, terms)})
    LIMIT 40
  `);
  const byVersion = new Map<string, { row: LexicalRow; chunk?: ChunkRow }>();
  for (const row of named) byVersion.set(row.versionId, { row });
  for (const chunk of chunks) {
    const row: LexicalRow = {
      nodeId: chunk.nodeId, name: chunk.name, updatedAt: chunk.updatedAt, versionId: chunk.versionId,
      versionNo: chunk.versionNo, parseStatus: chunk.parseStatus, originalName: chunk.originalName,
      summary: chunk.summary, score: chunk.score,
    };
    chunk.score = termScore(chunk.content, terms);
    const prev = byVersion.get(chunk.versionId);
    if (!prev) byVersion.set(chunk.versionId, { row, chunk });
    else if (chunk.score > (prev.chunk?.score ?? -1)) prev.chunk = chunk;
  }
  return [...byVersion.values()]
    .map((entry) => {
      entry.row.score = termScore(`${entry.row.name}\n${entry.row.summary}\n${entry.chunk?.content ?? ''}`, terms);
      return entry;
    })
    .sort((a, b) => b.row.score - a.row.score || b.row.updatedAt.getTime() - a.row.updatedAt.getTime())
    .slice(0, 21)
    .map(({ row, chunk }) => toHit(row, chunk, terms));
}

export async function querySemantic(
  db: SqlClient,
  actor: { tenantId: string; userId: string },
  vector: readonly number[],
): Promise<IndexedLibraryHit[]> {
  const literal = vectorLiteral(vector);
  if (!literal) return [];
  const rows = await db.$queryRaw<Array<ChunkRow & { nodeId: string; name: string; versionNo: number }>>(Prisma.sql`
    SELECT n.id AS "nodeId", n.name, v.id AS "versionId", v.version_no AS "versionNo",
           c.locator, c.locator_kind AS "locatorKind", c.content, 1 AS score
    FROM library_chunk c
    JOIN library_version v ON v.id = c.version_id
    JOIN library_node n ON n.current_version_id = v.id
    WHERE ${visible(actor)}
      AND v.parse_status = 'READY'
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT 21
  `);
  return rows.map((row) => ({
    nodeId: row.nodeId,
    versionId: row.versionId,
    versionNo: row.versionNo,
    name: row.name,
    locator: row.locator,
    locatorKind: row.locatorKind === 'page' ? 'page' : 'paragraph',
    quote: excerptAround(row.content, row.content.slice(0, 24)),
    matched: 'text',
    score: 1,
  }));
}

function toHit(row: LexicalRow, chunk: ChunkRow | undefined, terms: readonly string[]): IndexedLibraryHit {
  const viewable = VIEWABLE_IMAGE_EXTENSIONS.has(fileExtension(row.originalName));
  const textScore = chunk?.score ?? 0;
  const imageOnly = viewable && textScore === 0;
  const content = chunk?.content ?? (row.summary || '');
  const matchedTerm = terms.find((term) => content.toLowerCase().includes(term.toLowerCase())) ?? terms[0] ?? '';
  const source = imageOnly ? undefined : chunk ?? (row.summary ? { locator: 'summary:1', locatorKind: 'paragraph', content: row.summary } : undefined);
  return {
    nodeId: row.nodeId,
    versionId: row.versionId,
    versionNo: row.versionNo,
    name: row.name,
    locator: source?.locator ?? 'image',
    locatorKind: source?.locatorKind === 'page' ? 'page' : source ? 'paragraph' : 'image',
    quote: source ? excerptAround(source.content, matchedTerm) : '',
    matched: textScore > 0 || (row.summary && terms.some((term) => row.summary.toLowerCase().includes(term.toLowerCase())) && !chunk) ? 'text' : 'name',
    ...(imageOnly ? { image: true as const } : {}),
    score: row.score,
  };
}
