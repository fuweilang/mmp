import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HistoryListDto, UploadHistoryDto } from './dto/session-history.dto';

@Injectable()
export class SessionHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async scope(user: User, tenantId: string | null) {
    if (!user.isPlatformAdmin) {
      if (!tenantId || !await this.prisma.orgMember.findFirst({ where: { tenantId, userId: user.id } })) {
        throw new ForbiddenException('当前账号无权访问该企业的会话历史');
      }
    }
    return { userId: user.id, tenantScope: tenantId ?? '' };
  }

  async upload(user: User, tenantId: string | null, body: UploadHistoryDto) {
    const scope = await this.scope(user, tenantId);
    if (body.accountId !== user.id || (body.tenantId ?? null) !== tenantId) throw new ForbiddenException('会话归属与当前登录账号不一致');
    if (body.messages.some(message => message.seq > body.revision) || body.visibleSeqs?.some(seq => seq > body.revision)) {
      throw new BadRequestException('消息序号超出本次同步范围');
    }
    if (body.final && !body.visibleSeqs) throw new BadRequestException('完成同步时必须提供可见消息序号');
    return this.prisma.$transaction(async tx => {
      const row = await tx.syncedConversation.upsert({
        where: { userId_tenantScope_deviceId_sessionId: { ...scope, deviceId: body.deviceId, sessionId: body.sessionId } },
        create: { ...scope, tenantId, deviceId: body.deviceId, sessionId: body.sessionId,
          deviceName: body.deviceName, clientKind: body.clientKind, title: body.title, projectName: body.projectName,
          sourceCreatedAt: new Date(body.createdAt), sourceUpdatedAt: new Date(body.updatedAt) },
        update: {},
      });
      await tx.$queryRaw`SELECT id FROM synced_conversation WHERE id = ${row.id} FOR UPDATE`;
      const current = await tx.syncedConversation.findUniqueOrThrow({ where: { id: row.id } });
      if (current.sourceRevision > body.revision || (current.sourceRevision === body.revision && !current.syncing)) return { id: row.id, revision: current.sourceRevision, accepted: false };
      if (body.messages.length) await tx.syncedConversationMessage.createMany({
        data: body.messages.map(message => ({ conversationId: row.id, sourceSeq: message.seq,
          role: message.role, text: message.text, sourceTime: new Date(message.time) })), skipDuplicates: true,
      });
      if (body.final) {
        const visibleSeqs = body.visibleSeqs!;
        const received = await tx.syncedConversationMessage.count({ where: { conversationId: row.id, sourceSeq: { in: visibleSeqs } } });
        if (received !== visibleSeqs.length) throw new ConflictException('消息尚未完整上传，请重试同步');
        await tx.syncedConversationMessage.deleteMany({ where: { conversationId: row.id, sourceSeq: { notIn: visibleSeqs } } });
      }
      await tx.syncedConversation.update({ where: { id: row.id }, data: {
        title: body.title, projectName: body.projectName, deviceName: body.deviceName, state: body.state,
        sourceRevision: body.revision, sourceUpdatedAt: new Date(body.updatedAt), syncing: !body.final,
        files: body.files.map(name => ({ name, access: 'source-device-only' })), deviceSeenAt: new Date(),
        ...(body.final ? { lastSyncedAt: new Date() } : {}),
      } });
      return { id: row.id, revision: body.revision, accepted: true };
    });
  }

  async list(user: User, tenantId: string | null, query: HistoryListDto) {
    const scope = await this.scope(user, tenantId);
    let before: Prisma.SyncedConversationWhereInput = {};
    if (query.cursor) {
      const cursor = await this.prisma.syncedConversation.findFirst({ where: { ...scope, id: query.cursor } });
      if (!cursor) throw new BadRequestException('分页位置已失效，请刷新列表');
      before = { OR: [{ sourceUpdatedAt: { lt: cursor.sourceUpdatedAt } }, { sourceUpdatedAt: cursor.sourceUpdatedAt, id: { lt: cursor.id } }] };
    }
    const rows = await this.prisma.syncedConversation.findMany({
      where: { ...scope, AND: [before,
        ...(query.q ? [{ OR: [{ title: { contains: query.q, mode: 'insensitive' as const } }, { projectName: { contains: query.q, mode: 'insensitive' as const } }] }] : []),
        ...(query.project ? [{ projectName: query.project }] : [])] },
      orderBy: [{ sourceUpdatedAt: 'desc' }, { id: 'desc' }], take: 51,
      select: { id: true, title: true, projectName: true, deviceName: true, deviceId: true, clientKind: true,
        sourceCreatedAt: true, sourceUpdatedAt: true, state: true, syncing: true, lastSyncedAt: true, deviceSeenAt: true },
    });
    return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null };
  }

  async detail(user: User, tenantId: string | null, id: string, after = -1) {
    const scope = await this.scope(user, tenantId);
    const conversation = await this.prisma.syncedConversation.findFirst({ where: { ...scope, id } });
    if (!conversation) throw new NotFoundException('会话不存在或无权访问');
    const rows = await this.prisma.syncedConversationMessage.findMany({ where: { conversationId: id, sourceSeq: { gt: after } }, orderBy: { sourceSeq: 'asc' }, take: 201 });
    return { conversation, messages: rows.slice(0, 200), nextAfter: rows.length > 200 ? rows[199].sourceSeq : null };
  }

  async heartbeat(user: User, tenantId: string | null, deviceId: string) {
    const scope = await this.scope(user, tenantId);
    await this.prisma.syncedConversation.updateMany({ where: { ...scope, deviceId }, data: { deviceSeenAt: new Date() } });
    return { ok: true };
  }
}
