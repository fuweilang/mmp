import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KbStatus, OfficialAgentKind, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { basename, extname, join, resolve, sep } from 'path';
import { chunkText, extractText } from '../knowledge/index-text';
import { absoluteUploadPath, assertAllowedFile, saveOfficialFile, uploadRoot } from '../knowledge/storage';
import { PrismaService } from '../prisma/prisma.service';
import { loadOfficialAgentAssets, officialAgentAssetsRoot, type OfficialKbAssetFile } from './official-agent-assets';

/** Sentinel tenantId for Host Zod that still requires a non-empty string; not a real tenant. */
export const OFFICIAL_KB_TENANT_SENTINEL = 'official';

const PREVIEW_MAX_CHARS = 200_000;

type UploadedOfficialFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class OfficialKbService {
  constructor(private prisma: PrismaService) {}

  async hasDocuments(agentId: string) {
    const count = await this.prisma.officialKbDocument.count({
      where: { agentId, active: true, status: KbStatus.READY },
    });
    return count > 0;
  }

  /**
   * Idempotently sync asset KB markdown into official storage + chunks.
   * Uses staging replacement so a failed re-index never blanks live retrieval.
   */
  async syncFromAssets(agentId: string, files: OfficialKbAssetFile[], versionId?: string | null) {
    const synced: Array<{ assetKey: string; documentId: string; status: KbStatus; sizeBytes: number; active: boolean }> =
      [];
    for (const file of files) {
      if (!file.content?.length) throw new Error(`官方知识资产正文为空: ${file.assetKey}`);
      const buffer = Buffer.from(sanitizeText(file.content), 'utf8');
      const contentHash = createHash('sha256').update(buffer).digest('hex');
      const existing = await this.prisma.officialKbDocument.findFirst({
        where: { agentId, assetKey: file.assetKey, active: true },
      });
      if (existing) {
        const abs = absoluteUploadPath(existing.storagePath);
        const same =
          existsSync(abs) &&
          createHash('sha256').update(readFileSync(abs)).digest('hex') === contentHash &&
          existing.status === KbStatus.READY;
        if (same) {
          if (versionId && existing.versionId !== versionId) {
            await this.prisma.officialKbDocument.update({
              where: { id: existing.id },
              data: { versionId },
            });
          }
          synced.push({
            assetKey: file.assetKey,
            documentId: existing.id,
            status: existing.status,
            sizeBytes: existing.sizeBytes,
            active: existing.active,
          });
          continue;
        }
        const promoted = await this.stageAndPromote({
          agentId,
          assetKey: file.assetKey,
          name: file.name,
          originalName: file.originalName,
          mimeType: 'text/markdown',
          buffer,
          versionId: versionId ?? existing.versionId,
          replaceOfId: existing.id,
        });
        synced.push({
          assetKey: file.assetKey,
          documentId: promoted.id,
          status: promoted.status,
          sizeBytes: promoted.sizeBytes,
          active: promoted.active,
        });
        continue;
      }

      const promoted = await this.stageAndPromote({
        agentId,
        assetKey: file.assetKey,
        name: file.name,
        originalName: file.originalName,
        mimeType: 'text/markdown',
        buffer,
        versionId: versionId ?? null,
      });
      synced.push({
        assetKey: file.assetKey,
        documentId: promoted.id,
        status: promoted.status,
        sizeBytes: promoted.sizeBytes,
        active: promoted.active,
      });
    }
    return synced;
  }

  async search(agentId: string, query: string) {
    const q = query.trim().slice(0, 200);
    if (!q) return { tenantId: OFFICIAL_KB_TENANT_SENTINEL, hits: [] as OfficialHit[] };
    const variants = lexicalQueryVariants(q);
    if (variants.length === 0) return { tenantId: OFFICIAL_KB_TENANT_SENTINEL, hits: [] as OfficialHit[] };

    const rows = await this.prisma.officialKbChunk.findMany({
      where: {
        agentId,
        document: { agentId, status: KbStatus.READY, active: true },
        OR: variants.map((term) => ({ content: { contains: term, mode: 'insensitive' as const } })),
      },
      include: { document: { select: { id: true, name: true } } },
      take: 12,
      orderBy: { ordinal: 'asc' },
    });

    const scored = new Map<string, OfficialHit>();
    for (const row of rows) {
      scored.set(row.id, {
        documentId: row.document.id,
        documentName: row.document.name,
        ordinal: row.ordinal,
        folderName: '官方知识库',
        snippet: snippetOf(row.content, q),
        score: variants.some((term) => row.content.includes(term)) ? 12 : 6,
      });
    }
    const hits = [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 8);
    return { tenantId: OFFICIAL_KB_TENANT_SENTINEL, hits };
  }

  async file(agentId: string, documentId: string) {
    const current = await this.prisma.officialKbDocument.findFirst({
      where: { id: documentId, agentId, status: KbStatus.READY, active: true },
    });
    if (!current) throw new NotFoundException('官方资料不存在或不属于当前专家');
    const abs = absoluteUploadPath(current.storagePath);
    if (!existsSync(abs)) throw new NotFoundException('官方资料文件已丢失');
    return { abs, name: current.originalName, mime: current.mimeType };
  }

  /** Load KB asset files declared under assets/kb/<key>/ for one agent key. */
  loadAssetFiles(agentKey: string, declared: OfficialKbAssetFile[]): OfficialKbAssetFile[] {
    const root = officialAgentAssetsRoot();
    const out: OfficialKbAssetFile[] = [];
    for (const item of declared) {
      if (item.content?.trim()) {
        out.push(item);
        continue;
      }
      const rel = item.sourcePath || join('kb', agentKey, item.assetKey);
      const abs = join(root, rel);
      if (!existsSync(abs)) throw new Error(`官方知识资产缺失: ${rel}`);
      out.push({
        ...item,
        content: readFileSync(abs, 'utf8'),
        originalName: item.originalName || item.assetKey,
      });
    }
    return out;
  }

  async listAdminDocuments(filters: {
    keyword?: string;
    agentId?: string;
    status?: KbStatus;
    activeOnly?: boolean;
  }) {
    const keyword = filters.keyword?.trim();
    const rows = await this.prisma.officialKbDocument.findMany({
      where: {
        ...(filters.agentId ? { agentId: filters.agentId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.activeOnly === false ? {} : { active: true }),
        ...(keyword
          ? {
              OR: [
                { name: { contains: keyword, mode: 'insensitive' } },
                { originalName: { contains: keyword, mode: 'insensitive' } },
                { assetKey: { contains: keyword, mode: 'insensitive' } },
                { agent: { name: { contains: keyword, mode: 'insensitive' } } },
                { agent: { key: { contains: keyword, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        agent: { select: { id: true, key: true, name: true, kind: true, status: true } },
        version: { select: { id: true, version: true, publishedAt: true } },
        _count: { select: { chunks: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return rows.map((row) => this.toAdminRow(row));
  }

  async getAdminDocument(documentId: string) {
    const row = await this.prisma.officialKbDocument.findUnique({
      where: { id: documentId },
      include: {
        agent: { select: { id: true, key: true, name: true, kind: true, status: true } },
        version: { select: { id: true, version: true, publishedAt: true } },
        _count: { select: { chunks: true } },
      },
    });
    if (!row) throw new NotFoundException('官方资料不存在');
    return this.toAdminRow(row);
  }

  async readAdminContent(documentId: string) {
    const row = await this.prisma.officialKbDocument.findUnique({ where: { id: documentId } });
    if (!row) throw new NotFoundException('官方资料不存在');
    const abs = absoluteUploadPath(row.storagePath);
    if (!existsSync(abs)) throw new NotFoundException('官方资料文件已丢失');
    const ext = extname(row.originalName).toLowerCase();
    if (!['.md', '.txt', '.markdown'].includes(ext) && !row.mimeType.startsWith('text/')) {
      throw new BadRequestException('当前文件类型仅支持下载，不提供原文预览');
    }
    const raw = sanitizeText(readFileSync(abs, 'utf8'));
    const truncated = raw.length > PREVIEW_MAX_CHARS;
    return {
      id: row.id,
      name: row.name,
      originalName: row.originalName,
      mimeType: row.mimeType,
      truncated,
      content: truncated ? raw.slice(0, PREVIEW_MAX_CHARS) : raw,
    };
  }

  async adminDownload(documentId: string) {
    const row = await this.prisma.officialKbDocument.findUnique({ where: { id: documentId } });
    if (!row) throw new NotFoundException('官方资料不存在');
    // Never accept user-provided paths; only DB-backed relative storagePath under upload root.
    if (
      !row.storagePath ||
      row.storagePath.includes('..') ||
      row.storagePath.startsWith('/') ||
      row.storagePath.includes('\\')
    ) {
      throw new BadRequestException('非法文件路径');
    }
    const root = resolve(uploadRoot());
    const abs = resolve(root, row.storagePath);
    const rootPrefix = root.endsWith(sep) ? root : root + sep;
    if (abs !== root && !abs.startsWith(rootPrefix)) {
      throw new BadRequestException('非法文件路径');
    }
    if (!existsSync(abs)) throw new NotFoundException('官方资料文件已丢失');
    return { abs, name: row.originalName, mime: row.mimeType };
  }

  async listAdminChunks(documentId: string) {
    const row = await this.prisma.officialKbDocument.findUnique({ where: { id: documentId } });
    if (!row) throw new NotFoundException('官方资料不存在');
    const chunks = await this.prisma.officialKbChunk.findMany({
      where: { documentId },
      orderBy: { ordinal: 'asc' },
      select: { id: true, ordinal: true, content: true },
    });
    return {
      documentId,
      total: chunks.length,
      chunks: chunks.map((chunk) => ({
        id: chunk.id,
        ordinal: chunk.ordinal,
        preview: chunk.content.slice(0, 240),
        length: chunk.content.length,
      })),
    };
  }

  async uploadAdminDocument(input: {
    agentId: string;
    file: UploadedOfficialFile | undefined;
    name?: string;
    assetKey?: string;
  }) {
    const agent = await this.assertAgentAcceptsOfficialKb(input.agentId);
    const file = this.requireUpload(input.file);
    assertAllowedFile(file.originalname, file.buffer.length);
    const assetKey = normalizeAssetKey(input.assetKey || file.originalname);
    const existingActive = await this.prisma.officialKbDocument.findFirst({
      where: { agentId: agent.id, assetKey, active: true },
    });
    if (existingActive) {
      throw new BadRequestException(`该专家已有同名资料键 ${assetKey}，请使用替换`);
    }
    const mimeType = file.mimetype || mimeFromName(file.originalname);
    const promoted = await this.stageAndPromote({
      agentId: agent.id,
      assetKey,
      name: (input.name?.trim() || stripExt(file.originalname) || assetKey).slice(0, 120),
      originalName: basename(file.originalname).slice(0, 200),
      mimeType,
      buffer: file.buffer,
      versionId: agent.onlineVersionId,
    });
    return this.getAdminDocument(promoted.id);
  }

  async replaceAdminDocument(documentId: string, file: UploadedOfficialFile | undefined, name?: string) {
    const current = await this.prisma.officialKbDocument.findUnique({
      where: { id: documentId },
      include: { agent: true },
    });
    if (!current) throw new NotFoundException('官方资料不存在');
    if (!current.active) {
      throw new BadRequestException('只能替换当前生效资料；失败的暂存件可直接重新上传或替换生效件');
    }
    await this.assertAgentAcceptsOfficialKb(current.agentId);
    const upload = this.requireUpload(file);
    assertAllowedFile(upload.originalname, upload.buffer.length);
    const mimeType = upload.mimetype || mimeFromName(upload.originalname);
    const promoted = await this.stageAndPromote({
      agentId: current.agentId,
      assetKey: current.assetKey,
      name: (name?.trim() || current.name).slice(0, 120),
      originalName: basename(upload.originalname).slice(0, 200),
      mimeType,
      buffer: upload.buffer,
      versionId: current.versionId ?? current.agent.onlineVersionId,
      replaceOfId: current.id,
    });
    return this.getAdminDocument(promoted.id);
  }

  async reindexAdminDocument(documentId: string) {
    const current = await this.prisma.officialKbDocument.findUnique({ where: { id: documentId } });
    if (!current) throw new NotFoundException('官方资料不存在');
    if (current.active && current.status === KbStatus.READY) {
      // Reindex in place only when already active+READY would wipe chunks briefly.
      // Stage a copy from the same file bytes so live retrieval stays on the old row until READY.
      const abs = absoluteUploadPath(current.storagePath);
      if (!existsSync(abs)) throw new NotFoundException('官方资料文件已丢失');
      const buffer = readFileSync(abs);
      const promoted = await this.stageAndPromote({
        agentId: current.agentId,
        assetKey: current.assetKey,
        name: current.name,
        originalName: current.originalName,
        mimeType: current.mimeType,
        buffer,
        versionId: current.versionId,
        replaceOfId: current.id,
      });
      return this.getAdminDocument(promoted.id);
    }
    await this.indexDocument(current.id);
    if (!current.active) {
      const refreshed = await this.prisma.officialKbDocument.findUniqueOrThrow({ where: { id: current.id } });
      if (refreshed.status === KbStatus.READY) {
        await this.activateDocument(refreshed.id, refreshed.agentId, refreshed.assetKey);
      }
    }
    return this.getAdminDocument(documentId);
  }

  async listBindableAgents() {
    const agents = await this.prisma.officialAgent.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        key: true,
        name: true,
        kind: true,
        status: true,
        toolScope: true,
        onlineVersionId: true,
        officialDocuments: {
          where: { active: true },
          select: { id: true },
          take: 1,
        },
      },
    });
    return agents
      .filter((agent) => this.canBindOfficialKb(agent))
      .map((agent) => ({
        id: agent.id,
        key: agent.key,
        name: agent.name,
        kind: agent.kind,
        status: agent.status,
        hasOfficialKb: agent.officialDocuments.length > 0,
      }));
  }

  private canBindOfficialKb(agent: {
    key: string;
    kind: OfficialAgentKind;
    toolScope: Prisma.JsonValue;
    officialDocuments: Array<{ id: string }>;
  }) {
    if (agent.officialDocuments.length > 0) return true;
    const tools = asStringArray(agent.toolScope);
    if (!tools.includes('enterprise_knowledge')) return false;
    // Avoid flipping enterprise-only KNOWLEDGE agents (no asset KB) onto official retrieval.
    const assets = loadOfficialAgentAssets([agent.key]);
    return Boolean(assets[0]?.kbFiles?.length);
  }

  private async assertAgentAcceptsOfficialKb(agentId: string) {
    const agent = await this.prisma.officialAgent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        key: true,
        kind: true,
        toolScope: true,
        onlineVersionId: true,
        officialDocuments: {
          where: { active: true },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!agent) throw new NotFoundException('官方专家不存在');
    if (!this.canBindOfficialKb(agent)) {
      throw new BadRequestException(
        '该专家不能绑定官方知识库：避免纯 Prompt 或企业资料型专家被改成只检索官方资料',
      );
    }
    return agent;
  }

  private requireUpload(file: UploadedOfficialFile | undefined): UploadedOfficialFile {
    if (!file?.buffer?.length) throw new BadRequestException('请选择要上传的文件');
    return file;
  }

  /**
   * Create inactive staging doc → index → on READY flip active and demote previous.
   * On FAILED, previous active doc (if any) stays searchable.
   */
  private async stageAndPromote(input: {
    agentId: string;
    assetKey: string;
    name: string;
    originalName: string;
    mimeType: string;
    buffer: Buffer;
    versionId?: string | null;
    replaceOfId?: string;
  }) {
    const storagePath = await saveOfficialFile(input.agentId, input.originalName, input.buffer);
    const staging = await this.prisma.officialKbDocument.create({
      data: {
        agentId: input.agentId,
        versionId: input.versionId ?? null,
        assetKey: input.assetKey,
        name: input.name,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
        storagePath,
        status: KbStatus.PENDING,
        active: false,
        indexError: null,
      },
    });
    await this.indexDocument(staging.id);
    const indexed = await this.prisma.officialKbDocument.findUniqueOrThrow({ where: { id: staging.id } });
    if (indexed.status !== KbStatus.READY) {
      return indexed;
    }
    await this.activateDocument(indexed.id, input.agentId, input.assetKey, input.replaceOfId);
    return this.prisma.officialKbDocument.findUniqueOrThrow({ where: { id: indexed.id } });
  }

  private async activateDocument(
    documentId: string,
    agentId: string,
    assetKey: string,
    replaceOfId?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.officialKbDocument.updateMany({
        where: {
          agentId,
          assetKey,
          active: true,
          id: { not: documentId },
        },
        data: { active: false },
      });
      if (replaceOfId && replaceOfId !== documentId) {
        await tx.officialKbDocument.updateMany({
          where: { id: replaceOfId, active: true },
          data: { active: false },
        });
      }
      await tx.officialKbDocument.update({
        where: { id: documentId },
        data: { active: true, status: KbStatus.READY, indexError: null },
      });
    });
  }

  private async indexDocument(documentId: string) {
    const doc = await this.prisma.officialKbDocument.findUniqueOrThrow({ where: { id: documentId } });
    try {
      const abs = absoluteUploadPath(doc.storagePath);
      const buffer = readFileSync(abs);
      const text = sanitizeText(await extractText(doc.originalName, buffer));
      const chunks = chunkText(text).map(sanitizeText);
      if (chunks.length === 0) throw new Error('无可索引正文');
      await this.prisma.$transaction(async (tx) => {
        await tx.officialKbChunk.deleteMany({ where: { documentId } });
        await tx.officialKbChunk.createMany({
          data: chunks.map((content, ordinal) => ({
            agentId: doc.agentId,
            documentId,
            ordinal,
            content,
          })),
        });
        await tx.officialKbDocument.update({
          where: { id: documentId },
          data: { status: KbStatus.READY, indexError: null },
        });
      });
    } catch (error) {
      await this.prisma.officialKbDocument.update({
        where: { id: documentId },
        data: {
          status: KbStatus.FAILED,
          indexError: error instanceof Error ? error.message.slice(0, 500) : '索引失败',
        },
      });
    }
  }

  private toAdminRow(row: {
    id: string;
    agentId: string;
    versionId: string | null;
    assetKey: string;
    name: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status: KbStatus;
    indexError: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    agent: { id: string; key: string; name: string; kind: OfficialAgentKind; status: string };
    version: { id: string; version: number; publishedAt: Date } | null;
    _count: { chunks: number };
  }) {
    return {
      id: row.id,
      agentId: row.agentId,
      assetKey: row.assetKey,
      name: row.name,
      originalName: row.originalName,
      mimeType: row.mimeType,
      fileType: extname(row.originalName).replace(/^\./, '').toLowerCase() || 'bin',
      sizeBytes: row.sizeBytes,
      status: row.status,
      indexError: row.indexError,
      active: row.active,
      chunkCount: row._count.chunks,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      agent: {
        id: row.agent.id,
        key: row.agent.key,
        name: row.agent.name,
        kind: row.agent.kind,
        status: row.agent.status,
      },
      // Only surface a real published version number; never invent one.
      effectiveVersion: row.version
        ? { id: row.version.id, version: row.version.version, publishedAt: row.version.publishedAt.toISOString() }
        : null,
    };
  }
}

type OfficialHit = {
  documentId: string;
  documentName: string;
  ordinal: number;
  folderName: string | null;
  snippet: string;
  score: number;
};

export function lexicalQueryVariants(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const variants = new Set<string>();
  const add = (value: string) => {
    const term = value.trim();
    // Keep focused keywords; long whole-sentence probes rarely exist as substrings.
    if (term.length >= 2 && term.length <= 32) variants.add(term);
  };

  // Title punctuation (·•) often appears in prompts/doc names but not body text.
  const normalized = trimmed.replace(/[·•・‧]/g, '');
  add(trimmed);
  add(normalized);
  for (const part of trimmed.split(/[·•・‧]+/)) add(part);

  let work = normalized
    .replace(/[？?！!。．.\s]+$/g, '')
    .replace(/(是什么|是多少|有哪些|包含哪些|怎么样|如何|吗|呢)+$/g, '')
    .trim();
  add(work);

  // Strip instruction wrappers models often append into the tool query.
  // Keep 请结合/请依据 scopes tight so "请结合知识库分析 利基市场…" does not erase the noun.
  work = work
    .replace(/请(?:依据|结合)(?:官方)?知识库/g, ' ')
    .replace(/请依据[^，。；;]{0,24}[，。；;]?/g, ' ')
    .replace(/并给出[^，。；;]{0,24}[，。；;]?/g, ' ')
    .replace(/用一句话[^，。；;]{0,24}[，。；;]?/g, ' ')
    .replace(/一句话说明[^，。；;]{0,24}[，。；;]?/g, ' ')
    .replace(/资料名称/g, ' ')
    .replace(/《([^》]+)》/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
  add(work);

  const compact = work.replace(/[？?！!，,。．.\s：:、；;（）()【】\[\]《》"'“”‘’]/g, '').trim();
  add(compact);

  // Mid-sentence question/connective split → OR terms (整句 contains 失败时仍可命中短词).
  for (const part of work.split(/(?:如何|怎么|怎样|有哪些|包含哪些|是什么|是多少|怎么样|以及|并且|能如何)/)) {
    add(part);
    add(part.replace(/[的地得]/g, ''));
  }
  for (const part of work.split(/[？?！!，,。．.\s：:、；;（）()【】\[\]《》"'“”‘’]+/)) {
    add(part);
  }

  // Sliding CJK windows recover noun phrases like「利基市场」「本质特征」「方法论智囊」.
  if (/[\u4e00-\u9fff]/.test(compact) && compact.length >= 4) {
    for (const win of [4, 6]) {
      if (compact.length < win) continue;
      for (let i = 0; i + win <= Math.min(compact.length, 24); i += 1) {
        add(compact.slice(i, i + win));
      }
    }
  }

  return [...variants].slice(0, 24);
}

function snippetOf(content: string, query: string) {
  const needle = lexicalQueryVariants(query).find((term) => content.includes(term)) ?? query;
  const idx = content.indexOf(needle);
  const start = idx >= 0 ? Math.max(0, idx - 40) : 0;
  const slice = content.slice(start, start + 180).replace(/\s+/g, ' ').trim();
  return start > 0 ? `…${slice}` : slice;
}

function sanitizeText(input: string) {
  return input
    .replace(/\u0000/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '\uFFFD')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

function asStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeAssetKey(raw: string) {
  const base = basename(raw.trim()).replace(/[^\w.\-\u4e00-\u9fff]+/g, '_');
  const key = base.slice(0, 120) || `doc-${Date.now()}.md`;
  return key;
}

function stripExt(name: string) {
  const ext = extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

function mimeFromName(name: string) {
  const ext = extname(name).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'text/markdown';
  if (ext === '.txt') return 'text/plain';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

void Prisma;
