import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessScope, KbStatus, User } from '@prisma/client';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateFolderDto, PatchDocumentDto } from './dto/knowledge.dto';
import { chunkText, embedText, extractText, vectorLiteral } from './index-text';
import { absoluteUploadPath, removeStoredFile, saveTenantFile } from './storage';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class KnowledgeService {
  constructor(
    private prisma: PrismaService,
    private tenants: TenantService,
  ) {}

  async folders(user: User, tenantId: string | null) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.kb');
    return this.prisma.kbFolder.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createFolder(user: User, tenantId: string | null, dto: CreateFolderDto) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.kb');
    const folder = await this.prisma.kbFolder.create({
      data: { tenantId: id, name: dto.name.trim() },
    });
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId: id, action: 'create_kb_folder', meta: { folderId: folder.id } },
    });
    return folder;
  }

  async deleteFolder(user: User, tenantId: string | null, folderId: string) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.kb');
    const folder = await this.prisma.kbFolder.findFirst({ where: { id: folderId, tenantId: id } });
    if (!folder) throw new NotFoundException('目录不存在');
    const count = await this.prisma.kbDocument.count({ where: { folderId } });
    if (count > 0) throw new BadRequestException('请先移出或删除目录中的文件');
    await this.prisma.kbFolder.delete({ where: { id: folderId } });
    return { ok: true };
  }

  async documents(user: User, tenantId: string | null, folderId?: string) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.kb');
    const rows = await this.prisma.kbDocument.findMany({
      where: {
        tenantId: id,
        ...(folderId === 'none' ? { folderId: null } : folderId ? { folderId } : {}),
      },
      include: {
        folder: { select: { id: true, name: true } },
        grants: { select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toRow(row));
  }

  async upload(
    user: User,
    tenantId: string | null,
    file: UploadedFile | undefined,
    folderId?: string,
    visibility?: AccessScope,
    userIds?: string[],
  ) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.kb');
    if (!file) throw new BadRequestException('请选择文件');
    const vis = visibility === AccessScope.SELECTED ? AccessScope.SELECTED : AccessScope.ALL;
    this.assertSelectedGrants(vis, userIds);
    if (folderId) await this.requireFolder(id, folderId);

    let storagePath: string;
    try {
      storagePath = await saveTenantFile(id, file.originalname, file.buffer);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : '上传失败');
    }

    const doc = await this.prisma.kbDocument.create({
      data: {
        tenantId: id,
        folderId: folderId || null,
        name: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
        storagePath,
        status: KbStatus.PENDING,
        visibility: vis,
        grants: { create: vis === AccessScope.SELECTED ? [...new Set(userIds)].map((userId) => ({ userId })) : [] },
      },
    }).catch(async (error: unknown) => {
      await removeStoredFile(storagePath);
      throw error;
    });
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId: id, action: 'upload_kb', meta: { documentId: doc.id } },
    });
    await this.indexPending(id, doc.id);
    return this.getOne(id, doc.id);
  }

  async patch(user: User, tenantId: string | null, documentId: string, dto: PatchDocumentDto) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.kb');
    const current = await this.prisma.kbDocument.findFirst({ where: { id: documentId, tenantId: id } });
    if (!current) throw new NotFoundException('文件不存在');
    if (dto.folderId) await this.requireFolder(id, dto.folderId);
    const visibility = dto.visibility ?? current.visibility;
    const changeGrants = dto.visibility !== undefined || dto.userIds !== undefined;
    const grantIds = changeGrants ? dto.userIds ?? (await this.currentGrantIds(documentId)) : [];
    if (changeGrants) this.assertSelectedGrants(visibility, grantIds);
    const nextStatus = dto.status ?? current.status;
    await this.prisma.kbDocument.update({
      where: { id: documentId },
      data: {
        name: dto.name?.trim(),
        folderId: dto.folderId === undefined ? undefined : dto.folderId || null,
        status: nextStatus === KbStatus.READY && current.status !== KbStatus.READY ? KbStatus.PENDING : dto.status,
        indexError: dto.status === undefined ? undefined : null,
        visibility: dto.visibility,
        grants: changeGrants ? {
          deleteMany: {},
          create: visibility === AccessScope.SELECTED ? [...new Set(grantIds)].map((userId) => ({ userId })) : [],
        } : undefined,
      },
    });
    if (nextStatus === KbStatus.READY && current.status !== KbStatus.READY) {
      await this.indexPending(id, documentId);
    }
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId: id, action: 'update_kb', meta: { documentId } },
    });
    return this.getOne(id, documentId);
  }

  async remove(user: User, tenantId: string | null, documentId: string) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.kb');
    const current = await this.prisma.kbDocument.findFirst({ where: { id: documentId, tenantId: id } });
    if (!current) throw new NotFoundException('文件不存在');
    await this.prisma.kbDocument.delete({ where: { id: documentId } });
    await removeStoredFile(current.storagePath);
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId: id, action: 'delete_kb', meta: { documentId } },
    });
    return { ok: true };
  }

  async search(
    user: User,
    tenantId: string | null,
    query: string,
    folderIds?: readonly string[],
  ) {
    const id = await this.tenants.requireTenant(user, tenantId);
    const q = query.trim().slice(0, 200);
    if (!q || folderIds?.length === 0) return { tenantId: id, hits: [] };
    const allowed = await this.visibleDocumentIds(id, user.id, folderIds);
    if (allowed.length === 0) return { tenantId: id, hits: [] };
    const lexicalQueries = lexicalQueryVariants(q);

    const lexical = await this.prisma.kbChunk.findMany({
      where: {
        tenantId: id,
        documentId: { in: allowed },
        document: this.visibleDocumentScope(id, user.id, folderIds),
        OR: lexicalQueries.map((term) => ({ content: { contains: term, mode: 'insensitive' as const } })),
      },
      include: {
        document: { select: { id: true, name: true, folder: { select: { name: true } } } },
      },
      take: 12,
      orderBy: { ordinal: 'asc' },
    });

    const scored = new Map<
      string,
      {
        documentId: string;
        documentName: string;
        ordinal: number;
        folderName: string | null;
        snippet: string;
        score: number;
      }
    >();
    for (const row of lexical) {
      scored.set(row.id, {
        documentId: row.document.id,
        documentName: row.document.name,
        ordinal: row.ordinal,
        folderName: row.document.folder?.name ?? null,
        snippet: snippetOf(row.content, q),
        score: lexicalQueries.some((term) => row.content.includes(term)) ? 12 : 6,
      });
    }

    const vectorHits = await this.vectorSearch(id, user.id, allowed, q);
    for (const hit of vectorHits) {
      const current = scored.get(hit.id);
      if (current) {
        current.score += hit.score;
        continue;
      }
      scored.set(hit.id, hit.row);
    }

    const hits = [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 8);
    return { tenantId: id, hits };
  }

  async file(
    user: User,
    tenantId: string | null,
    documentId: string,
    source = false,
    folderIds?: readonly string[],
  ) {
    const id = source ? await this.tenants.requireTenant(user, tenantId)
      : await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.kb');
    if (folderIds?.length === 0) throw new NotFoundException('文件不存在');
    const current = await this.prisma.kbDocument.findFirst({ where: {
      id: documentId, tenantId: id,
      ...(source ? this.visibleDocumentScope(id, user.id, folderIds) : {}),
    } });
    if (!current) throw new NotFoundException('文件不存在');
    const abs = absoluteUploadPath(current.storagePath);
    if (!existsSync(abs)) throw new NotFoundException('文件已丢失');
    return {
      abs,
      name: current.originalName,
      mime: current.mimeType,
    };
  }

  private assertSelectedGrants(visibility: AccessScope, userIds?: string[]) {
    if (visibility === AccessScope.SELECTED && (!userIds || userIds.length === 0)) {
      throw new BadRequestException('指定成员时至少选择一人');
    }
  }

  private async requireFolder(tenantId: string, folderId: string) {
    const folder = await this.prisma.kbFolder.findFirst({ where: { id: folderId, tenantId } });
    if (!folder) throw new NotFoundException('目录不存在');
  }

  private async currentGrantIds(documentId: string) {
    const grants = await this.prisma.kbGrant.findMany({ where: { documentId }, select: { userId: true } });
    return grants.map((g) => g.userId);
  }

  private async getOne(tenantId: string, documentId: string) {
    const row = await this.prisma.kbDocument.findFirst({
      where: { id: documentId, tenantId },
      include: {
        folder: { select: { id: true, name: true } },
        grants: { select: { userId: true } },
      },
    });
    if (!row) throw new NotFoundException('文件不存在');
    return this.toRow(row);
  }

  private toRow(row: {
    id: string;
    tenantId: string;
    folderId: string | null;
    name: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status: KbStatus;
    indexError: string | null;
    visibility: AccessScope;
    createdAt: Date;
    folder: { id: string; name: string } | null;
    grants: Array<{ userId: string }>;
  }) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      folderId: row.folderId,
      folderName: row.folder?.name ?? null,
      name: row.name,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      status: row.status,
      indexError: row.indexError,
      visibility: row.visibility,
      userIds: row.grants.map((g) => g.userId),
      createdAt: row.createdAt,
    };
  }

  private async indexPending(tenantId: string, documentId: string) {
    const pending = { id: documentId, tenantId, status: KbStatus.PENDING };
    const doc = await this.prisma.kbDocument.findFirst({ where: pending });
    if (!doc) return;
    let indexError = '文件无法读取或解析，请检查格式后重试';
    try {
      const buffer = await readFile(absoluteUploadPath(doc.storagePath));
      const chunks = chunkText(await extractText(doc.originalName, buffer));
      if (chunks.length === 0) {
        indexError = '未提取到文字。扫描件请先转换成可复制文字的 PDF';
        throw new Error(indexError);
      }
      indexError = '索引建立失败，请重试';
      const vectors = chunks.map((chunk) => vectorLiteral(embedText(chunk)));
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.kbDocument.updateMany({ where: pending, data: { status: KbStatus.READY, indexError: null } });
        if (!claimed.count) return;
        await tx.kbChunk.deleteMany({ where: { tenantId, documentId } });
        await tx.kbChunk.createMany({ data: chunks.map((content, ordinal) => ({ tenantId, documentId, ordinal, content })) });
        for (let ordinal = 0; ordinal < vectors.length; ordinal += 1) {
          await tx.$executeRawUnsafe(
            'UPDATE kb_chunk SET embedding = $1::vector WHERE tenant_id = $2 AND document_id = $3 AND ordinal = $4',
            vectors[ordinal],
            tenantId,
            documentId,
            ordinal,
          );
        }
      });
    } catch {
      await this.prisma.kbDocument.updateMany({ where: pending, data: { status: KbStatus.FAILED, indexError } });
    }
  }

  private async visibleDocumentIds(
    tenantId: string,
    userId: string,
    folderIds?: readonly string[],
  ) {
    const rows = await this.prisma.kbDocument.findMany({
      where: this.visibleDocumentScope(tenantId, userId, folderIds),
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private visibleDocumentScope(
    tenantId: string,
    userId: string,
    folderIds?: readonly string[],
  ) {
    return {
      tenantId,
      status: KbStatus.READY,
      ...(folderIds ? { folderId: { in: [...folderIds] } } : {}),
      OR: [{ visibility: AccessScope.ALL }, { grants: { some: { userId } } }],
    };
  }

  private async vectorSearch(tenantId: string, userId: string, documentIds: string[], query: string) {
    if (documentIds.length === 0) return [];
    type VectorRow = {
      id: string;
      content: string;
      documentId: string;
      documentName: string;
      ordinal: number;
      folderName: string | null;
      score: number;
    };
    try {
      const rows = await this.prisma.$queryRawUnsafe<VectorRow[]>(
        `SELECT c.id, c.content, c.ordinal, d.id AS "documentId", d.name AS "documentName", f.name AS "folderName",
                (1 - (c.embedding <=> $3::vector))::float AS score
         FROM kb_chunk c
         JOIN kb_document d ON d.id = c.document_id
         LEFT JOIN kb_folder f ON f.id = d.folder_id
         WHERE c.tenant_id = $1
           AND d.tenant_id = $1 AND d.status = 'READY'
           AND (d.visibility = 'ALL' OR EXISTS (
             SELECT 1 FROM kb_grant g WHERE g.document_id = d.id AND g.user_id = $4
           ))
           AND c.document_id = ANY($2::text[])
           AND c.embedding IS NOT NULL
         ORDER BY c.embedding <=> $3::vector
         LIMIT 8`,
        tenantId,
        documentIds,
        vectorLiteral(embedText(query)),
        userId,
      );
      return rows
        .filter((row) => row.score > 0.05)
        .map((row) => ({
          id: row.id,
          score: row.score,
          row: {
            documentId: row.documentId,
            documentName: row.documentName,
            ordinal: row.ordinal,
            folderName: row.folderName,
            snippet: snippetOf(row.content, query),
            score: row.score,
          },
        }));
    } catch {
      return [];
    }
  }
}


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
