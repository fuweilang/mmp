import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { MemberRole, Prisma, TenantType, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminEnterpriseDto } from './dto/create-admin-enterprise.dto';
import { UpdateAdminEnterpriseDto } from './dto/update-admin-enterprise.dto';
import { creditSignupGiftInTx } from '../billing/welcome-gift';
import { AdminSupportService, enterpriseSelect } from './admin-support.service';

@Injectable()
export class AdminEnterprisesService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private support: AdminSupportService,
  ) {}

  async onModuleInit() {
    await this.ensureHeadquarters();
  }

  /** 猛犸总部是平台根节点，也是超级管理员自己的资料企业。不另建第二家。 */
  async ensureHeadquarters() {
    let platform = await this.prisma.tenant.findFirst({
      where: { type: TenantType.PLATFORM },
      orderBy: { createdAt: 'asc' },
    });
    if (!platform) {
      platform = await this.prisma.tenant.create({
        data: { name: '猛犸总部', slug: 'platform', type: TenantType.PLATFORM, quota: { create: {} } },
      });
    } else if (platform.name !== '猛犸总部') {
      platform = await this.prisma.tenant.update({ where: { id: platform.id }, data: { name: '猛犸总部' } });
    }
    const supers = await this.prisma.userRole.findMany({
      where: { role: { key: 'super_admin' }, user: { status: 'active' } },
      select: { userId: true },
    });
    for (const row of supers) {
      await this.prisma.orgMember.upsert({
        where: { userId_tenantId: { userId: row.userId, tenantId: platform.id } },
        create: { userId: row.userId, tenantId: platform.id, role: MemberRole.ADMIN },
        update: {},
      });
    }
    return platform;
  }

  async listEnterprises(actor: User) {
    const scope = await this.support.adminScope(actor);
    if (scope === null) await this.ensureHeadquarters();
    // 平台管理员看全量树，含猛犸总部；非空 scope 时只看范围内租户。
    const tenants = await this.prisma.tenant.findMany({
      where: scope === null ? { type: { in: ['ENTERPRISE', 'AGENCY', 'PLATFORM'] } } : { id: { in: scope } },
      select: enterpriseSelect,
      orderBy: { createdAt: 'asc' },
    });
    const rows = tenants.map((tenant) => this.support.presentEnterprise(tenant));
    return [...rows.filter((row) => row.type === 'PLATFORM'), ...rows.filter((row) => row.type !== 'PLATFORM')];
  }

  async createEnterprise(actor: User, dto: CreateAdminEnterpriseDto) {
    const scope = await this.support.adminScope(actor);
    const type = dto.type === 'AGENCY' ? TenantType.AGENCY : TenantType.ENTERPRISE;
    const slug = dto.slug.trim();
    const existing = await this.prisma.tenant.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('品牌已存在');

    // 上级：平台管理员可指定任意树内上级（空=直属总部）；非空 scope 时上级默认范围根节点。
    let parentId: string | null = null;
    if (scope === null) {
      parentId = dto.parentId ?? null;
    } else {
      if (scope.length === 0) throw new ForbiddenException('你的代理树下没有可用节点');
      parentId = scope[0];
    }
    if (parentId) {
      await this.support.assertTenantInScope(scope, parentId, '上级');
      const parent = await this.prisma.tenant.findUnique({ where: { id: parentId } });
      if (!parent) throw new NotFoundException('上级不存在');
    }

    // 管理员统一到「用户管理」里开户（手机号、密码、角色都在那边管理）。
    const tenant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          name: dto.name.trim(),
          slug,
          type,
          status: dto.status ?? 'active',
          quota: { create: {} },
          aiWallet: { create: { balanceCoins: 0 } },
        },
      });
      const platform = await tx.tenant.findFirst({ where: { type: TenantType.PLATFORM } });
      await tx.orgTree.create({
        data: { parentId: parentId ?? platform!.id, childId: created.id },
      });
      const wallet = await tx.tenantAiWallet.findUniqueOrThrow({
        where: { tenantId: created.id },
      });
      await creditSignupGiftInTx(tx, {
        tenantId: created.id,
        walletId: wallet.id,
        actorUserId: actor.id,
      });
      return created;
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        tenantId: tenant.id,
        action: 'admin_create_enterprise',
        meta: { slug, type, parentId },
      },
    });
    return this.support.getEnterprise(tenant.id);
  }

  async updateEnterprise(actor: User, id: string, dto: UpdateAdminEnterpriseDto) {
    const scope = await this.support.adminScope(actor);
    await this.support.assertTenantInScope(scope, id);
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('企业不存在');
    if (existing.type === TenantType.PLATFORM) throw new ForbiddenException('猛犸总部只能查看');

    const data: Prisma.TenantUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.slug !== undefined && dto.slug.trim() !== existing.slug) {
      const slug = dto.slug.trim();
      const dup = await this.prisma.tenant.findUnique({ where: { slug } });
      if (dup) throw new ConflictException('品牌已存在');
      data.slug = slug;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.tenant.update({ where: { id }, data });
    }
    await this.prisma.auditLog.create({
      data: { userId: actor.id, tenantId: id, action: 'admin_update_enterprise' },
    });
    return this.support.getEnterprise(id);
  }

  async getEnterpriseDeletionImpact(actor: User, id: string) {
    const scope = await this.support.adminScope(actor);
    await this.support.assertTenantInScope(scope, id);
    return this.support.computeEnterpriseDeletionImpact(actor, id);
  }

  async deleteEnterprise(actor: User, id: string) {
    const scope = await this.support.adminScope(actor);
    await this.support.assertTenantInScope(scope, id);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        agents: { select: { name: true } },
        _count: {
          select: {
            children: true,
            kbFolders: true,
            kbDocuments: true,
            usageEvents: true,
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('企业不存在');
    if (tenant.type === TenantType.PLATFORM) throw new BadRequestException('总部不可删除');
    if (this.support.hasEnterpriseBusinessData(tenant)) {
      throw new BadRequestException('有数据，不能删除');
    }

    const impact = await this.support.computeEnterpriseDeletionImpact(actor, id);
    const removableUserIds = impact.deletedUsers.map((user) => user.id);

    await this.prisma.$transaction(async (tx) => {
      if (removableUserIds.length > 0) {
        await tx.user.deleteMany({ where: { id: { in: removableUserIds } } });
      }
      await tx.tenant.delete({ where: { id } });
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'admin_delete_enterprise',
        meta: { slug: tenant.slug, deletedUserIds: removableUserIds },
      },
    });
    return { ok: true };
  }


}
