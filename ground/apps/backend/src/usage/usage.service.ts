import { BadRequestException, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { PatchQuotaDto, PatchUserTokenQuotaDto } from './usage.dto';

/** 0 = 不限制；对话次数拦截已关闭，不再因超额 403 */
const DEFAULT_MONTHLY_TURNS = 0;

@Injectable()
export class UsageService {
  constructor(
    private prisma: PrismaService,
    private tenants: TenantService,
  ) {}

  async quota(user: User, tenantId: string | null) {
    const id = await this.tenants.requireTenant(user, tenantId);
    const quota = await this.ensureQuota(id);
    const usedTurns = await this.monthTurns(id);
    const usedTokens = await this.monthTokens(id);
    // 产品已关掉对话次数拦截：始终按不限制返回，prepare 不会拦
    const limit = 0;
    const monthlyTokens = quota.monthlyTokens;
    return {
      monthlyTurns: limit,
      monthlyTokens,
      usedTurns,
      usedTokens,
      remainingTurns: null,
      remainingTokens: monthlyTokens > 0 ? Math.max(0, monthlyTokens - usedTokens) : null,
      exceeded: false,
      tokensExceeded: monthlyTokens > 0 && usedTokens >= monthlyTokens,
      message: undefined,
    };
  }

  /** 企业内各成员月度 Token 额度与当月用量（console.usage 权限）。 */
  async listUserTokenQuotas(user: User, tenantId: string | null) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.usage');
    const start = monthStart();
    const [members, quotas, usageRows] = await Promise.all([
      this.prisma.orgMember.findMany({
        where: { tenantId: id },
        select: { userId: true, user: { select: { id: true, name: true, phone: true } } },
        take: 500,
      }),
      this.prisma.userTokenQuota.findMany({ where: { tenantId: id } }),
      this.prisma.tokenUsageTurn.groupBy({
        by: ['userId'],
        where: { tenantId: id, occurredAt: { gte: start } },
        _sum: { totalTokens: true },
      }),
    ]);
    const quotaMap = new Map(quotas.map((q) => [q.userId, q.monthlyTokens]));
    const usedMap = new Map(usageRows.map((r) => [r.userId, r._sum.totalTokens ?? 0]));
    return {
      tenantQuota: (await this.ensureQuota(id)).monthlyTokens,
      members: members.map((m) => {
        const limit = quotaMap.get(m.userId) ?? 0;
        const used = usedMap.get(m.userId) ?? 0;
        return {
          userId: m.userId,
          name: m.user.name,
          phone: m.user.phone,
          monthlyTokens: limit,
          usedTokens: used,
          remainingTokens: limit > 0 ? Math.max(0, limit - used) : null,
          exceeded: limit > 0 && used >= limit,
        };
      }),
    };
  }

  async patchUserTokenQuota(user: User, tenantId: string | null, dto: PatchUserTokenQuotaDto) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.usage');
    const member = await this.prisma.orgMember.findFirst({ where: { tenantId: id, userId: dto.userId } });
    if (!member) throw new BadRequestException('该用户不在本企业');
    await this.prisma.userTokenQuota.upsert({
      where: { tenantId_userId: { tenantId: id, userId: dto.userId } },
      create: { tenantId: id, userId: dto.userId, monthlyTokens: dto.monthlyTokens },
      update: { monthlyTokens: dto.monthlyTokens },
    });
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId: id, action: 'update_user_token_quota', meta: { targetUserId: dto.userId, monthlyTokens: dto.monthlyTokens } },
    });
    return this.listUserTokenQuotas(user, id);
  }

  private monthTokens(tenantId: string) {
    return this.prisma.tokenUsageTurn.aggregate({
      where: { tenantId, occurredAt: { gte: monthStart() } },
      _sum: { totalTokens: true },
    }).then((row) => row._sum.totalTokens ?? 0);
  }

  async patchQuota(user: User, tenantId: string | null, dto: PatchQuotaDto) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.usage');
    const current = await this.ensureQuota(id);
    const quota = await this.prisma.quota.update({
      where: { id: current.id },
      data: {
        monthlyTurns: dto.monthlyTurns ?? current.monthlyTurns,
        monthlyTokens: dto.monthlyTokens ?? current.monthlyTokens,
      },
    });
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId: id, action: 'update_quota', meta: { monthlyTurns: quota.monthlyTurns } },
    });
    return this.quota(user, id);
  }

  async record(user: User, tenantId: string | null, kind: 'chat_turn') {
    const id = await this.tenants.requireTenant(user, tenantId);
    // 不再校验超额；仅记账
    const event = await this.prisma.usageEvent.create({
      data: { tenantId: id, userId: user.id, kind, quantity: 1 },
    });
    return { id: event.id, ok: true };
  }

  async summary(user: User, tenantId: string | null) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.usage');
    const snapshot = await this.quota(user, id);
    const start = monthStart();
    const recent = await this.prisma.usageEvent.findMany({
      where: { tenantId: id, createdAt: { gte: start } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, userId: true, kind: true, quantity: true, createdAt: true },
    });
    return { ...snapshot, recent };
  }

  async monthTurnsFor(tenantId: string) {
    return this.monthTurns(tenantId);
  }

  async ensureQuota(tenantId: string) {
    const existing = await this.prisma.quota.findUnique({ where: { tenantId } });
    if (existing) return existing;
    return this.prisma.quota.create({
      data: { tenantId, monthlyTurns: DEFAULT_MONTHLY_TURNS, monthlyTokens: 0 },
    });
  }

  private monthTurns(tenantId: string) {
    return this.prisma.usageEvent.aggregate({
      where: { tenantId, kind: 'chat_turn', createdAt: { gte: monthStart() } },
      _sum: { quantity: true },
    }).then((row) => row._sum.quantity ?? 0);
  }
}

export function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
