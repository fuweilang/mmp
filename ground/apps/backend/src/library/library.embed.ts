import type { PrismaService } from '../prisma/prisma.service';
import type { KnowledgeHttpAdapter } from '../knowledge-core/provider';

type EmbedClient = {
  knowledgeProfile: PrismaService['knowledgeProfile'];
};

export async function embedLibraryQuery(db: EmbedClient, adapter: KnowledgeHttpAdapter, text: string): Promise<number[] | null> {
  const profile = await db.knowledgeProfile.findFirst({
    where: { task: 'EMBEDDING', enabled: true, dimension: 1024 },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!profile) return null;
  try {
    const result = await adapter.embed(profile.id, [text.slice(0, 500)]);
    const vector = result.vectors[0];
    return vector?.length === 1024 ? vector : null;
  } catch {
    return null;
  }
}

type PendingClient = PrismaService;

export async function embedPendingLibraryChunks(db: PendingClient, adapter: KnowledgeHttpAdapter): Promise<number> {
  const profile = await db.knowledgeProfile.findFirst({
    where: { task: 'EMBEDDING', enabled: true, dimension: 1024 },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!profile) return 0;
  const rows = await db.$queryRaw<Array<{ id: string; content: string }>>`
    SELECT c.id, left(c.content, 1500) AS content
    FROM library_chunk c
    WHERE c.embedding IS NULL AND c.content <> ''
    LIMIT 16
  `;
  if (rows.length === 0) return 0;
  const result = await adapter.embed(profile.id, rows.map((row) => row.content));
  let written = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const vector = result.vectors[index];
    const row = rows[index];
    if (!vector || vector.length !== 1024 || !row) continue;
    if (vector.some((value) => !Number.isFinite(value))) continue;
    const literal = `[${vector.join(',')}]`;
    await db.$executeRaw`UPDATE library_chunk SET embedding = ${literal}::vector WHERE id = ${row.id} AND embedding IS NULL`;
    written += 1;
  }
  return written;
}
