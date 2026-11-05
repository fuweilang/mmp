import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { computeEffectivePermissions } from '../permissions/effective';
import { AdminAuditQueryDto, AuditQueryDto } from './audit.dto';

const ADMIN_AUDIT_PERM = 'portal.admin.audit';
const PLATFORM_TENANT_FILTER = '__platform__';

const SENSITIVE_KEY_RE =
  /(password|passwd|pwd|token|secret|authorization|cookie|credential|api[_-]?key|private[_-]?key)/i;
const PHONE_KEY_RE = /(phone|mobile|tel)/i;

@Injectable()
export class AuditService {
  constructor(
    private prisma: PrismaService,
    private tenants: TenantService,
  ) {}

  async list(user: User, tenantId: string | null, query: AuditQueryDto) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.usage');
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const action = query.action?.trim();
    const where = {
      tenantId: id,
      ...(action ? { action } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, rows };
  }

  async adminList(actor: User, query: AdminAuditQueryDto) {
    await this.requireAdminAudit(actor);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const action = query.action?.trim();
    const actorKeyword = query.actor?.trim();
    const tenantFilter = query.tenantId?.trim();

    const where: Prisma.AuditLogWhereInput = {};

    if (tenantFilter === PLATFORM_TENANT_FILTER) {
      where.tenantId = null;
    } else if (tenantFilter) {
      where.tenantId = tenantFilter;
    }

    if (action) where.action = action;

    const createdAt = this.buildCreatedAtFilter(query.from, query.to);
    if (createdAt) where.createdAt = createdAt;

    if (actorKeyword) {
      const users = await this.prisma.user.findMany({
        where: {
          OR: [
            { id: actorKeyword },
            { name: { contains: actorKeyword, mode: 'insensitive' } },
            { phone: { contains: actorKeyword } },
          ],
        },
        select: { id: true },
        take: 200,
      });
      const ids = users.map((u) => u.id);
      if (!ids.length) {
        return { total: 0, page, pageSize, rows: [] };
      }
      where.userId = { in: ids };
    }

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const tenantIds = [...new Set(rows.map((r) => r.tenantId).filter(Boolean))] as string[];
    const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];

    const [tenants, users] = await Promise.all([
      tenantIds.length
        ? this.prisma.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, phone: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string; phone: string }>),
    ]);

    const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      total,
      page,
      pageSize,
      rows: rows.map((row) => {
        const actorUser = row.userId ? userMap.get(row.userId) : undefined;
        return {
          id: row.id,
          tenantId: row.tenantId,
          enterpriseName: row.tenantId ? tenantName.get(row.tenantId) ?? row.tenantId : '仅平台',
          userId: row.userId,
          actorName: actorUser?.name ?? (row.userId ? row.userId : '-'),
          actorPhone: actorUser?.phone ? this.maskPhone(actorUser.phone) : null,
          action: row.action,
          ip: row.ip,
          meta: this.maskMeta(row.meta),
          createdAt: row.createdAt,
        };
      }),
    };
  }

  private async requireAdminAudit(actor: User) {
    const eff = await computeEffectivePermissions(this.prisma, actor.id, null);
    if (!eff.effectivePermissions.includes(ADMIN_AUDIT_PERM)) {
      throw new ForbiddenException('需要 portal.admin.audit 权限');
    }
  }

  private buildCreatedAtFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    const gte = this.parseDayStart(from);
    const lte = this.parseDayEnd(to);
    if (!gte && !lte) return undefined;
    return {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }

  /** Asia/Shanghai 自然日起点（本地盒已是 +8；按 YYYY-MM-DD 解析）。 */
  private parseDayStart(raw?: string): Date | null {
    const day = raw?.trim();
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    return new Date(`${day}T00:00:00+08:00`);
  }

  private parseDayEnd(raw?: string): Date | null {
    const day = raw?.trim();
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    return new Date(`${day}T23:59:59.999+08:00`);
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) return '***';
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  }

  private maskMeta(meta: Prisma.JsonValue | null): Prisma.JsonValue | null {
    if (meta == null) return null;
    return this.maskValue(meta, '') as Prisma.JsonValue;
  }

  private maskValue(value: unknown, key: string): unknown {
    if (value == null) return value;
    if (Array.isArray(value)) {
      return value.map((item) => this.maskValue(item, key));
    }
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.maskValue(v, k);
      }
      return out;
    }
    if (typeof value === 'string') {
      if (SENSITIVE_KEY_RE.test(key)) return '***';
      if (PHONE_KEY_RE.test(key)) return this.maskPhone(value);
      return value;
    }
    if (SENSITIVE_KEY_RE.test(key)) return '***';
    return value;
  }
}
