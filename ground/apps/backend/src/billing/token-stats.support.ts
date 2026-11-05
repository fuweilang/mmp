import { ForbiddenException, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { shanghaiDayRangeUnix } from './octop-usage.reader';
import { listEnabledChatModels } from './octop-providers.reader';

@Injectable()
export class TokenStatsSupport {
  shanghaiRangeDates(from?: string, to?: string): { start: Date; end: Date; startUnix: number; endUnix: number } {
    const { start, end } = shanghaiDayRangeUnix(from, to);
    return { start: new Date(start * 1000), end: new Date(end * 1000), startUnix: start, endUnix: end };
  }

  toTurnView(row: {
    id: string;
    tenantId: string | null;
    userId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    modelCalls: number;
    threadId: string;
    agentId: string;
    clientKind: string;
    source: string;
    idempotencyKey: string;
    occurredAt: Date;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.totalTokens,
      modelCalls: row.modelCalls,
      threadId: row.threadId,
      agentId: row.agentId,
      clientKind: row.clientKind,
      source: row.source,
      idempotencyKey: row.idempotencyKey,
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Octop Web/桌面每轮对话结束后上报物理 token。
   * tenantId 取自 JWT；无企业则落 null（Admin 企业统计不计）。
   */
  buildModelFilterOptions(usageModels: string[]): {
    models: string[];
    offlineModels: string[];
    catalogDbPath: string | null;
    catalogError?: string;
  } {
    const listed = listEnabledChatModels();
    const catalogIds: string[] = [];
    const catalogSet = new Set<string>();
    for (const m of listed.models) {
      const id = (m.modelId || '').trim();
      if (!id || catalogSet.has(id)) continue;
      catalogSet.add(id);
      catalogIds.push(id);
    }

    const usageIds: string[] = [];
    const usageSeen = new Set<string>();
    for (const raw of usageModels) {
      const id = (raw || '').trim() || '(unknown)';
      if (usageSeen.has(id)) continue;
      usageSeen.add(id);
      usageIds.push(id);
    }
    usageIds.sort((a, b) => a.localeCompare(b, 'zh'));

    const models: string[] = [];
    const seen = new Set<string>();
    for (const id of catalogIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      models.push(id);
    }
    const offlineModels: string[] = [];
    for (const id of usageIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      models.push(id);
      // 目录可读时才标 offline；读失败时不误标
      if (id !== '(unknown)' && !listed.error && !catalogSet.has(id)) offlineModels.push(id);
    }

    return {
      models,
      offlineModels,
      catalogDbPath: listed.dbPath || null,
      ...(listed.error ? { catalogError: listed.error } : {}),
    };
  }

  requirePlatformAdmin(actor: User) {
    if (!actor.isPlatformAdmin) throw new ForbiddenException('仅平台管理员可操作');
  }
}
