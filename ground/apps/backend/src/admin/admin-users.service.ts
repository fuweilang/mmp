import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { MemberRole, Prisma, TenantType, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { ADMIN_ACCESS_PERM, computeEffectivePermissions, listBoundRoleSources } from '../permissions/effective';
import { AdminSupportService, userSelect, roleGrantsAdmin, isPlatformAccountKey } from './admin-support.service';

@Injectable()
export class AdminUsersService {
  constructor(
    private prisma: PrismaService,
    private support: AdminSupportService,
  ) {}

  async listUsers(actor: User, query: ListAdminUsersDto) {
    const scope = await this.support.adminScope(actor);
    const where: Prisma.UserWhereInput = {};
    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword } },
      ];
    }
    if (query.role === 'none') {
      where.roles = { none: {} };
    } else if (query.role) {
      where.roles = { some: { role: { key: query.role } } };
    }
    if (query.status) where.status = query.status;
    // 数据范围：代理商只能看到自己树内的企业；范围为空 = 看不到任何企业用户。
    if (scope !== null) {
      where.memberships = { some: { tenantId: { in: scope } } };
    }
    if (query.enterpriseId) {
      await this.support.assertTenantInScope(scope, query.enterpriseId);
      where.memberships = { some: { tenantId: query.enterpriseId } };
    }

    const users = await this.prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => this.support.presentUser(user));
  }

  async createUser(actor: User, dto: CreateAdminUserDto) {
    const scope = await this.support.adminScope(actor);
    // 代理商不能开平台级账号（超管/平台管理员）；平台级 key 仅限平台管理员使用。
    if (scope !== null && (dto.platformRoleKey || dto.roleKeys?.some((k) => isPlatformAccountKey(k)))) {
      throw new ForbiddenException('代理商只能开企业/下级代理账号');
    }
    const phone = dto.phone.trim();
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) throw new ConflictException('手机号已存在');

    const tenantId = dto.tenantId ?? null;
    const roleKeys = this.support.resolveRoleKeys(dto);
    const roles = await this.support.loadRoles(roleKeys);
    // 只有全部是超级管理员/平台管理员时才能不绑企业；其余必须选一家企业。
    const platformOnly = roles.length > 0 && roles.every((role) => isPlatformAccountKey(role.key));
    if (!tenantId && !platformOnly) {
      throw new BadRequestException('除超级管理员、平台管理员外，用户必须有企业归属');
    }
    if (tenantId) {
      await this.support.assertTenantInScope(scope, tenantId);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException('企业不存在');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name.trim(),
          phone,
          passwordHash,
          isPlatformAdmin: roles.some((role) => roleGrantsAdmin(role)),
        },
      });
      if (roles.length > 0) await this.support.setUserRoles(tx, created.id, roles);
      if (tenantId) {
        await tx.orgMember.create({
          data: { userId: created.id, tenantId, role: this.support.membershipRole(roles) },
        });
      }
      return created;
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        tenantId,
        action: 'admin_create_user',
        meta: { targetUserId: user.id, roleKeys },
      },
    });
    return this.support.getUser(user.id);
  }

  async updateUser(actor: User, id: string, dto: UpdateAdminUserDto) {
    const scope = await this.support.adminScope(actor);
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('用户不存在');
    // 数据范围：目标用户必须在管理树的某家企业内；无企业归属的（纯平台账号）仅平台管理员可管。
    if (scope !== null) {
      const inScope = await this.prisma.orgMember.count({
        where: { userId: id, tenantId: { in: scope } },
      });
      if (inScope === 0) throw new ForbiddenException('该用户不在你的管理范围内');
    }

    const deactivating = dto.status !== undefined && dto.status !== 'active';
    if (actor.id === id && deactivating) throw new BadRequestException('不能停用自己');

    const currentKeys = await this.support.getRoleKeys(id);
    const currentlyPlatform = currentKeys.some((key) => isPlatformAccountKey(key));
    // 代理商不能改平台级角色/身份。
    if (scope !== null) {
      const nextKeys = dto.roleKeys ?? (dto.platformRoleKey ? [dto.platformRoleKey] : currentKeys);
      if (currentlyPlatform || nextKeys.some((k) => isPlatformAccountKey(k)) || dto.isPlatformAdmin !== undefined) {
        throw new ForbiddenException('代理商不能变更平台级角色或平台管理员身份');
      }
    }
    const isSuperAdminTarget = currentKeys.includes('super_admin');
    if (isSuperAdminTarget) {
      if (dto.roleKeys !== undefined && !dto.roleKeys.includes('super_admin')) {
        throw new BadRequestException('超级管理员角色不可变更');
      }
      if (dto.platformRoleKey !== undefined && dto.platformRoleKey !== 'super_admin') {
        throw new BadRequestException('超级管理员角色不可变更');
      }
      if (dto.isPlatformAdmin === false) throw new BadRequestException('超级管理员角色不可变更');
      if (deactivating) await this.support.assertCanManageSuperAdmin(actor, currentKeys, '停用');
    }

    if (dto.tenantId) {
      await this.support.assertTenantInScope(scope, dto.tenantId);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
      if (!tenant) throw new NotFoundException('企业不存在');
    }

    const roleChangeRequested = !isSuperAdminTarget && (dto.roleKeys !== undefined || dto.platformRoleKey !== undefined);
    const nextKeys = roleChangeRequested ? this.support.resolveRoleKeys(dto) : currentKeys;
    const nextRoles = roleChangeRequested ? await this.support.loadRoles(nextKeys) : [];
    const nextIsPlatformOnly = nextRoles.length > 0 && nextRoles.every((role) => isPlatformAccountKey(role.key));
    const nextHasAdmin = roleChangeRequested
      ? nextRoles.some((role) => roleGrantsAdmin(role))
      : existing.isPlatformAdmin;

    // 除超级管理员、平台管理员外，其余角色都必须挂在一家企业下。
    if (roleChangeRequested && !nextIsPlatformOnly) {
      const boundTenants = dto.tenantId !== undefined
        ? (dto.tenantId ? 1 : 0)
        : await this.prisma.orgMember.count({ where: { userId: id } });
      if (boundTenants < 1) {
        throw new BadRequestException('除超级管理员、平台管理员外，用户必须有企业归属');
      }
    }

    // 显式解绑全部企业：仅允许纯平台账号（超管/平台管理员）。
    if (dto.tenantId === null) {
      const keysForEnterprise = roleChangeRequested ? nextKeys : currentKeys;
      const clearingPlatformOnly =
        keysForEnterprise.length > 0
        && keysForEnterprise.every((key) => isPlatformAccountKey(key));
      if (!clearingPlatformOnly) {
        throw new BadRequestException('除超级管理员、平台管理员外，用户必须有企业归属');
      }
    }

    const demotingPlatform = currentlyPlatform && !nextHasAdmin;
    if (actor.id === id && demotingPlatform) {
      throw new BadRequestException('不能取消自己的平台管理员身份');
    }
    if (currentlyPlatform && (demotingPlatform || deactivating)) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: { isPlatformAdmin: true, status: 'active', id: { not: id } },
      });
      if (otherActiveAdmins < 1) {
        throw new BadRequestException('需保留至少一名可用状态的平台管理员，请先增配其他管理员');
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.status !== undefined) data.status = dto.status;

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.user.update({ where: { id }, data });
      }
      if (roleChangeRequested) {
        await this.support.setUserRoles(tx, id, nextRoles);
      }
      if (dto.tenantId !== undefined) {
        if (dto.tenantId === null) {
          await tx.orgMember.deleteMany({ where: { userId: id } });
        } else {
          await tx.orgMember.deleteMany({ where: { userId: id, tenantId: { not: dto.tenantId } } });
          const role = this.support.membershipRole(nextRoles.length > 0 ? nextRoles : await this.support.loadRoles(currentKeys));
          await tx.orgMember.upsert({
            where: { userId_tenantId: { userId: id, tenantId: dto.tenantId } },
            update: { role },
            create: { userId: id, tenantId: dto.tenantId, role },
          });
        }
      }
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'admin_update_user',
        meta: {
          targetUserId: id,
          ...(roleChangeRequested ? { roleKeys: nextKeys } : {}),
          ...(dto.tenantId !== undefined ? { tenantId: dto.tenantId } : {}),
        },
      },
    });
    return this.support.getUser(id);
  }

  /** 查看用户：在租户上下文下的有效权限并集（只读）。可传 tenantId；缺省时单企业自动选中，多企业需选择。 */
  async userPermissions(actor: User, id: string, tenantId?: string | null) {
    const scope = await this.support.adminScope(actor);
    await this.support.assertUserInScope(scope, id);
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        isPlatformAdmin: true,
        memberships: {
          select: { tenantId: true, tenant: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!existing) throw new NotFoundException('用户不存在');

    const tenants = existing.memberships.map((m) => ({
      id: m.tenant.id,
      name: m.tenant.name,
    }));
    let resolvedTenantId: string | null = tenantId ?? null;
    if (resolvedTenantId) {
      if (!tenants.some((t) => t.id === resolvedTenantId)) {
        throw new BadRequestException('该用户不属于所选企业');
      }
    } else if (tenants.length >= 1) {
      // 未指定时默认第一家企业；前端可用返回的 tenants 切换
      resolvedTenantId = tenants[0].id;
    }

    const eff = await computeEffectivePermissions(this.prisma, id, resolvedTenantId);
    const roles = await listBoundRoleSources(this.prisma, id, resolvedTenantId);
    return {
      permissions: eff.effectivePermissions,
      roles,
      isPlatformAdmin: existing.isPlatformAdmin,
      tenantId: resolvedTenantId,
      tenants,
    };
  }

  /** 数据范围校验：目标用户须在管理树内（平台管理员跳过）。 */
  async changePassword(actor: User, id: string, password: string) {
    const scope = await this.support.adminScope(actor);
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('用户不存在');
    await this.support.assertUserInScope(scope, id);

    await this.support.assertCanManageSuperAdmin(actor, await this.support.getRoleKeys(id), '修改密码');

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    await this.prisma.auditLog.create({
      data: { userId: actor.id, action: 'admin_change_user_password', meta: { targetUserId: id } },
    });
    return this.support.getUser(id);
  }

  async deactivateUser(actor: User, id: string) {
    const scope = await this.support.adminScope(actor);
    if (actor.id === id) throw new BadRequestException('不能停用自己');
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('用户不存在');
    await this.support.assertUserInScope(scope, id);
    await this.support.assertCanManageSuperAdmin(actor, await this.support.getRoleKeys(id), '停用');

    await this.prisma.user.update({ where: { id }, data: { status: 'inactive' } });
    await this.prisma.auditLog.create({
      data: { userId: actor.id, action: 'admin_deactivate_user', meta: { targetUserId: id } },
    });
    return this.support.getUser(id);
  }

  async deleteUser(actor: User, id: string) {
    const scope = await this.support.adminScope(actor);
    if (actor.id === id) throw new BadRequestException('不能删除自己');
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('用户不存在');
    await this.support.assertUserInScope(scope, id);
    if ((await this.support.getRoleKeys(id)).some((key) => isPlatformAccountKey(key))) {
      throw new BadRequestException('平台级账号不能删除');
    }

    await this.prisma.user.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'admin_delete_user',
        meta: { targetUserId: id, name: existing.name, phone: existing.phone },
      },
    });
    return { ok: true };
  }

}
