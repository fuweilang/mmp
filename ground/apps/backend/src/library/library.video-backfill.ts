import type { PrismaService } from '../prisma/prisma.service';
import { libraryAsrConfigured } from './library.asr';
import { librarySummary } from './library.items';
import { parseLibraryBytes } from './library.parse';
import type { PrismaLibraryStore } from './library.prisma-store';

const FAILED_REASON = '语音转写未成功，仅保存原视频';

export async function transcribeOnePendingVideo(db: PrismaService, store: PrismaLibraryStore): Promise<boolean> {
  if (!libraryAsrConfigured()) return false;
  const rows = await db.$queryRaw<Array<{ versionId: string; nodeId: string; tenantId: string }>>`
    SELECT v.id AS "versionId", n.id AS "nodeId", n.tenant_id AS "tenantId"
    FROM library_version v
    JOIN library_node n ON n.current_version_id = v.id
    WHERE v.parse_status = 'DOWNLOAD_ONLY'
      AND n.state = 'ACTIVE'
      AND n.kind = 'FILE'
      AND v.original_name ~* '\\.(mp4|webm|mov)$'
      AND COALESCE(v.parse_reason, '') <> ${FAILED_REASON}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return false;
  const version = await store.getVersion(row.versionId);
  if (!version) return false;
  const bytes = await store.getBlob(version.storageKey);
  if (!bytes) {
    await store.updateVersion(version.id, { parseReason: FAILED_REASON });
    return true;
  }
  const parsed = await parseLibraryBytes(version.originalName, bytes);
  if (parsed.status !== 'READY' || parsed.chunks.length === 0) {
    await store.updateVersion(version.id, { parseReason: FAILED_REASON });
    return true;
  }
  await store.commitParseResult({
    tenantId: row.tenantId,
    nodeId: row.nodeId,
    versionId: version.id,
    parseStatus: parsed.status,
    parseReason: parsed.reason,
    extractTruncated: parsed.truncated,
    summary: librarySummary(parsed.chunks),
    chunks: parsed.chunks.map((chunk) => ({
      id: store.createId(),
      versionId: version.id,
      tenantId: row.tenantId,
      ordinal: chunk.ordinal,
      content: chunk.content,
      locator: chunk.locator,
      locatorKind: chunk.locatorKind,
    })),
    audit: {
      id: store.createId(),
      tenantId: row.tenantId,
      userId: null,
      action: 'library_video_transcript',
      meta: { nodeId: row.nodeId, versionId: version.id },
      createdAt: Date.now(),
    },
  });
  return true;
}
