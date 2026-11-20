import { ForbiddenException, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { shanghaiDayRangeUnix } from './octop-usage.reader';

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
   * 当前启用的对话模型用 provider/modelId。历史用量里对不上的才标已下线。
   */
  buildModelFilterOptions(usageModels: string[], catalogIds: readonly string[]): {
    models: string[];
    offlineModels: string[];
    catalogDbPath: string | null;
  } {
    const catalogSet = new Set<string>();
    const models: string[] = [];
    for (const raw of catalogIds) {
      const id = (raw || '').trim();
      if (!id || catalogSet.has(id)) continue;
      catalogSet.add(id);
      models.push(id);
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

    const seen = new Set(catalogSet);
    const offlineModels: string[] = [];
    for (const id of usageIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      models.push(id);
      if (id !== '(unknown)') offlineModels.push(id);
    }

    return { models, offlineModels, catalogDbPath: null };
  }

  requirePlatformAdmin(actor: User) {
    if (!actor.isPlatformAdmin) throw new ForbiddenException('仅平台管理员可操作');
  }
}
