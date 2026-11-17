import { Injectable } from '@nestjs/common';
import { KbStatus, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class WorkbenchService {
  constructor(
    private prisma: PrismaService,
    private tenants: TenantService,
  ) {}

  async summary(user: User, tenantId: string | null) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.workbench');
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const [
      memberCount,
      kbDocumentCount,
      kbPendingCount,
      kbReadyCount,
      quota,
      usedTurns,
      aiWallet,
    ] = await Promise.all([
      this.prisma.orgMember.count({ where: { tenantId: id } }),
      this.prisma.kbDocument.count({ where: { tenantId: id } }),
      this.prisma.kbDocument.count({ where: { tenantId: id, status: KbStatus.PENDING } }),
      this.prisma.kbDocument.count({ where: { tenantId: id, status: KbStatus.READY } }),
      this.prisma.quota.findUnique({ where: { tenantId: id } }),
      this.prisma.usageEvent.aggregate({
        where: { tenantId: id, kind: 'chat_turn', createdAt: { gte: start } },
        _sum: { quantity: true },
      }),
      this.prisma.tenantAiWallet.findUnique({ where: { tenantId: id } }),
    ]);
    const monthlyTurns = quota?.monthlyTurns ?? 1000;
    const used = usedTurns._sum.quantity ?? 0;
    return {
      tenantName: tenant?.name ?? '',
      welcomeMessage: tenant?.welcomeMessage ?? '',
      logoUrl: tenant?.logoUrl ? '/console/api/enterprise/logo' : null,
      memberCount,
      kbDocumentCount,
      kbPendingCount,
      kbReadyCount,
      usedTurns: used,
      monthlyTurns,
      aiBalanceCoins: aiWallet?.balanceCoins ?? 0,
      aiTotalCredited: aiWallet?.totalCredited ?? 0,
      aiTotalDebited: aiWallet?.totalDebited ?? 0,
    };
  }
}
