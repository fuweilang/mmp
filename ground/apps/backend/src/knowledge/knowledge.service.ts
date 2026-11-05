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
      },
    });
    await this.replaceGrants(doc.id, vis, userIds);
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId: id, action: 'upload_kb', meta: { documentId: doc.id } },
    });
    return this.getOne(id, doc.id);
  }

  async patch(user: User, tenantId: string | null, documentId: string, dto: PatchDocumentDto) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.kb');
    const current = await this.prisma.kbDocument.findFirst({ where: { id: documentId, tenantId: id } });
    if (!current) throw new NotFoundException('文件不存在');
    if (dto.folderId) await this.requireFolder(id, dto.folderId);
    const visibility = dto.visibility ?? current.visibility;
    if (dto.visibility !== undefined || dto.userIds !== undefined) {
      this.assertSelectedGrants(visibility, dto.userIds ?? (await this.currentGrantIds(documentId)));
    }
    const nextStatus = dto.status ?? current.status;
    await this.prisma.kbDocument.update({
      where: { id: documentId },
      data: {
        name: dto.name?.trim(),
        folderId: dto.folderId === undefined ? undefined : dto.folderId || null,
        status: dto.status,
        visibility: dto.visibility,
      },
    });
    if (dto.visibility !== undefined || dto.userIds !== undefined) {
      await this.replaceGrants(documentId, visibility, dto.userIds);
    }
    if (nextStatus === KbStatus.READY && current.status !== KbStatus.READY) {
      const indexed = await this.reindex(id, documentId);
      if (!indexed) {
        await this.prisma.kbDocument.update({
          where: { id: documentId },
          data: { status: KbStatus.FAILED },
        });
        throw new BadRequestException('无法从文件提取文本，无法生效');
      }
    } else if (nextStatus !== KbStatus.READY && current.status === KbStatus.READY) {
      await this.prisma.kbChunk.deleteMany({ where: { documentId } });
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

  async search(user: User, tenantId: string | null, query: string) {
    const id = await this.tenants.requireTenant(user, tenantId);
    const q = query.trim().slice(0, 200);
    if (!q) return { tenantId: id, hits: [] };
    const allowed = await this.visibleDocumentIds(id, user.id);
    if (allowed.length === 0) return { tenantId: id, hits: [] };

    const lexical = await this.prisma.kbChunk.findMany({
      where: {
        tenantId: id,
        documentId: { in: allowed },
        content: { contains: q, mode: 'insensitive' },
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
        folderName: string | null;
        snippet: string;
        score: number;
      }
    >();
    for (const row of lexical) {
      scored.set(row.id, {
        documentId: row.document.id,
        documentName: row.document.name,
        folderName: row.document.folder?.name ?? null,
        snippet: snippetOf(row.content, q),
        score: row.content.includes(q) ? 12 : 6,
      });
    }

    const vectorHits = await this.vectorSearch(id, allowed, q);
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

  async file(user: User, tenantId: string | null, documentId: string) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.kb');
    const current = await this.prisma.kbDocument.findFirst({ where: { id: documentId, tenantId: id } });
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

  private async replaceGrants(documentId: string, visibility: AccessScope, userIds?: string[]) {
    await this.prisma.kbGrant.deleteMany({ where: { documentId } });
    if (visibility !== AccessScope.SELECTED || !userIds?.length) return;
    await this.prisma.kbGrant.createMany({
      data: userIds.map((userId) => ({ documentId, userId })),
      skipDuplicates: true,
    });
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
      visibility: row.visibility,
      userIds: row.grants.map((g) => g.userId),
      createdAt: row.createdAt,
    };
  }

  async reindex(tenantId: string, documentId: string) {
    const doc = await this.prisma.kbDocument.findFirst({ where: { id: documentId, tenantId } });
    if (!doc) return false;
    const abs = absoluteUploadPath(doc.storagePath);
    if (!existsSync(abs)) return false;
    const buffer = await readFile(abs);
    const chunks = chunkText(extractText(doc.originalName, buffer));
    await this.prisma.kbChunk.deleteMany({ where: { documentId } });
    if (chunks.length === 0) return false;
    const created = [];
    for (let i = 0; i < chunks.length; i += 1) {
      created.push(
        await this.prisma.kbChunk.create({
          data: { tenantId, documentId, ordinal: i, content: chunks[i] },
        }),
      );
    }
    for (const row of created) {
      const literal = vectorLiteral(embedText(row.content));
      await this.prisma.$executeRawUnsafe(
        'UPDATE kb_chunk SET embedding = $1::vector WHERE id = $2',
        literal,
        row.id,
      );
    }
    return true;
  }

  private async visibleDocumentIds(tenantId: string, userId: string) {
    const rows = await this.prisma.kbDocument.findMany({
      where: {
        tenantId,
        status: KbStatus.READY,
        OR: [{ visibility: AccessScope.ALL }, { grants: { some: { userId } } }],
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private async vectorSearch(tenantId: string, documentIds: string[], query: string) {
    if (documentIds.length === 0) return [];
    type VectorRow = {
      id: string;
      content: string;
      documentId: string;
      documentName: string;
      folderName: string | null;
      score: number;
    };
    try {
      const rows = await this.prisma.$queryRawUnsafe<VectorRow[]>(
        `SELECT c.id, c.content, d.id AS "documentId", d.name AS "documentName", f.name AS "folderName",
                (1 - (c.embedding <=> $3::vector))::float AS score
         FROM kb_chunk c
         JOIN kb_document d ON d.id = c.document_id
         LEFT JOIN kb_folder f ON f.id = d.folder_id
         WHERE c.tenant_id = $1
           AND c.document_id = ANY($2::text[])
           AND c.embedding IS NOT NULL
         ORDER BY c.embedding <=> $3::vector
         LIMIT 8`,
        tenantId,
        documentIds,
        vectorLiteral(embedText(query)),
      );
      return rows
        .filter((row) => row.score > 0.05)
        .map((row) => ({
          id: row.id,
          score: row.score,
          row: {
            documentId: row.documentId,
            documentName: row.documentName,
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

function snippetOf(content: string, query: string) {
  const idx = content.indexOf(query);
  const start = idx >= 0 ? Math.max(0, idx - 40) : 0;
  const slice = content.slice(start, start + 180).replace(/\s+/g, ' ').trim();
  return start > 0 ? `…${slice}` : slice;
}
