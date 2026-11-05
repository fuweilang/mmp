import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { MemberRole, RoleScope, TenantType, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeEffectivePermissions, listBoundRoleSources } from '../permissions/effective';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { CreateMemberDto } from './dto/create-member.dto';
import { PatchMemberDto } from './dto/patch-member.dto';

const memberUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  roles: {
    select: { role: { select: { id: true, key: true, name: true, scope: true, tenantId: true } } },
  },
} as const;

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async list(user: User) {
    if (user.isPlatformAdmin) {
      return this.prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });
    }
    const memberships = await this.prisma.orgMember.findMany({
      where: { userId: user.id },
      include: { tenant: true },
    });
    return memberships.map((m) => m.tenant);
  }

  async create(user: User, dto: CreateTenantDto) {
    if (dto.type === TenantType.PLATFORM) {
      throw new BadRequestException('总部租户不可再创建');
    }
    if (!user.isPlatformAdmin) {
      const parentId = dto.parentId;
      if (!parentId) throw new ForbiddenException('无权创建租户');
      const membership = await this.prisma.orgMember.findUnique({
        where: { userId_tenantId: { userId: user.id, tenantId: parentId } },
      });
      // 企业管理员判定走角色并集（user_role），不再看历史枚举。
      const isOrgAdmin = await this.prisma.userRole.count({
        where: { userId: user.id, role: { key: 'org_admin' } },
      });
      if (!membership || !isOrgAdmin) {
        throw new ForbiddenException('无权在该组织下创建');
      }
      if (dto.type !== TenantType.ENTERPRISE) {
        throw new ForbiddenException('代理商只能创建企业');
      }
    }
    const tenant = await this.prisma.tenant.create({
      data: { name: dto.name, slug: dto.slug, type: dto.type, quota: { create: {} } },
    });
    if (dto.parentId) {
      const parent = await this.prisma.tenant.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('上级组织不存在');
      await this.prisma.orgTree.create({ data: { parentId: parent.id, childId: tenant.id } });
    }
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId: tenant.id, action: 'create_tenant', meta: { slug: dto.slug } },
    });
    return tenant;
  }

  async members(user: User, tenantId: string | null) {
    const id = await this.requireConsolePerm(user, tenantId, 'portal.console.members');
    return this.prisma.orgMember.findMany({
      where: { tenantId: id },
      include: { user: { select: memberUserSelect } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 查看成员：基本信息 + 跨角色有效权限并集（只读，供成员页查看弹窗）。 */
  async memberPermissions(actor: User, tenantId: string | null, memberId: string) {
    const id = await this.requireConsolePerm(actor, tenantId, 'portal.console.members');
    const member = await this.prisma.orgMember.findFirst({
      where: { id: memberId, tenantId: id },
      include: { user: { select: memberUserSelect } },
    });
    if (!member) throw new NotFoundException('成员不存在');
    const target = await this.prisma.user.findUnique({
      where: { id: member.userId },
      select: { isPlatformAdmin: true },
    });
    const eff = await computeEffectivePermissions(this.prisma, member.userId, id);
    const roles = await listBoundRoleSources(this.prisma, member.userId, id);
    return {
      member,
      permissions: eff.effectivePermissions,
      roles,
      isPlatformAdmin: target?.isPlatformAdmin ?? false,
    };
  }

  /** 轻量成员列表（id/姓名/手机号），供知识库/用量等页面下拉用；只需登录控制台即可。 */
  async simpleMembers(user: User, tenantId: string | null) {
    const id = await this.requireConsolePerm(user, tenantId, 'portal.console.access');
    return this.prisma.orgMember.findMany({
      where: { tenantId: id },
      select: { id: true, user: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addMember(actor: User, tenantId: string | null, dto: CreateMemberDto) {
    const id = await this.requireConsolePerm(actor, tenantId, 'portal.console.members');
    await this.assertOrgAdmin(actor, id);
    let user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          name: dto.name,
          phone: dto.phone,
          passwordHash: await bcrypt.hash(dto.password, 10),
        },
      });
    }

    const existing = await this.prisma.orgMember.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: id } },
    });
    if (existing) throw new BadRequestException('该用户已在本企业');

    const presetKey = (dto.role ?? MemberRole.MEMBER) === MemberRole.MEMBER ? 'org_member' : 'org_admin';
    const preset = await this.prisma.role.findUnique({
      where: { key: presetKey },
      select: { id: true },
    });
    // 新成员默认给企业预设角色；用户已有角色时不覆盖
    if (preset) {
      const hasRole = await this.prisma.userRole.count({ where: { userId: user.id } });
      if (hasRole === 0) {
        await this.prisma.userRole.create({ data: { userId: user.id, roleId: preset.id } });
      }
    }
    if (dto.roleIds?.length) {
      await this.assertTenantRoleIds(id, dto.roleIds);
      await this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({ userId: user.id, roleId })),
        skipDuplicates: true,
      });
    }
    // roleIds 含管理员预设时同步历史枚举档（与 patchMember 口径一致）；显式传 role 时以 role 为准。
    let legacyRole = dto.role ?? MemberRole.MEMBER;
    if (dto.roleIds?.length) {
      const presets = await this.prisma.role.findMany({
        where: { key: { in: ['org_admin', 'org_member'] } },
        select: { id: true, key: true },
      });
      const set = new Set(dto.roleIds);
      if (presets.find((p) => p.key === 'org_admin' && set.has(p.id))) legacyRole = MemberRole.ADMIN;
      else if (presets.find((p) => p.key === 'org_member' && set.has(p.id))) legacyRole = MemberRole.MEMBER;
    }
    const member = await this.prisma.orgMember.create({
      data: { userId: user.id, tenantId: id, role: legacyRole },
      include: { user: { select: memberUserSelect } },
    });
    await this.prisma.auditLog.create({
      data: { userId: actor.id, tenantId: id, action: 'add_member', meta: { memberUserId: user.id } },
    });
    return member;
  }

  async patchMember(actor: User, tenantId: string | null, memberId: string, dto: PatchMemberDto) {
    const id = await this.requireConsolePerm(actor, tenantId, 'portal.console.members');
    await this.assertOrgAdmin(actor, id);
    const member = await this.prisma.orgMember.findFirst({
      where: { id: memberId, tenantId: id },
    });
    if (!member) throw new NotFoundException('成员不存在');

    // role 枚举字段已废弃：单独传 role 不再生效，角色一律走 roleIds 全量替换。
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('姓名不能为空');
      await this.prisma.user.update({ where: { id: member.userId }, data: { name } });
    }
    if (dto.roleIds !== undefined) {
      await this.assertKeepsOrgAdmin(id, member.userId, dto.roleIds);
      await this.replaceMemberRoles(id, member.userId, dto.roleIds);
      // 同步历史枚举档（老流程 tenant.create 还看 org_member.role）：含管理员预设=ADMIN，仅成员预设=MEMBER，纯自建不动。
      const presets = await this.prisma.role.findMany({
        where: { key: { in: ['org_admin', 'org_member'] } },
        select: { id: true, key: true },
      });
      const set = new Set(dto.roleIds);
      const legacy =
        presets.find((p) => p.key === 'org_admin' && set.has(p.id)) ? MemberRole.ADMIN
        : presets.find((p) => p.key === 'org_member' && set.has(p.id)) ? MemberRole.MEMBER
        : undefined;
      if (legacy !== undefined) {
        await this.prisma.orgMember.update({ where: { id: member.id }, data: { role: legacy } });
      }
    }
    await this.prisma.auditLog.create({
      data: { userId: actor.id, tenantId: id, action: 'update_member', meta: { memberUserId: member.userId } },
    });
    return this.prisma.orgMember.findFirstOrThrow({
      where: { id: member.id },
      include: { user: { select: memberUserSelect } },
    });
  }

  /**
   * 全量替换成员的企业角色绑定（只动 ORG_PRESET 预设和本企业 ORG_CUSTOM，
   * 平台角色 super_admin/platform_admin/历史 PLATFORM 自建不动）。
   * roleIds 为空时回落 org_member 预设，避免出现无角色导致权限全空。
   */
  private async replaceMemberRoles(tenantId: string, userId: string, roleIds: string[]) {
    const scoped = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { select: { id: true, scope: true, tenantId: true } } },
    });
    const toRemove = scoped.filter(
      (ur) =>
        ur.role.scope === RoleScope.ORG_PRESET ||
        (ur.role.scope === RoleScope.ORG_CUSTOM && ur.role.tenantId === tenantId),
    );
    const next = new Set(roleIds);
    const stale = toRemove.filter((ur) => !next.has(ur.role.id));
    if (stale.length) {
      await this.prisma.userRole.deleteMany({ where: { id: { in: stale.map((ur) => ur.id) } } });
    }

    let toAdd = roleIds.filter((roleId) => !toRemove.some((ur) => ur.role.id === roleId));
    if (roleIds.length === 0) {
      const preset = await this.prisma.role.findUnique({
        where: { key: 'org_member' },
        select: { id: true },
      });
      if (preset && !toRemove.some((ur) => ur.role.id === preset.id)) toAdd = [preset.id];
    }
    if (toAdd.length) {
      await this.assertTenantRoleIds(tenantId, toAdd);
      await this.prisma.userRole.createMany({
        data: toAdd.map((roleId) => ({ userId, roleId })),
        skipDuplicates: true,
      });
    }
  }

  /** 删除成员：与 admin/users 数据互通——非跨企业、无平台角色、非平台管理员时连账号一起删，否则只解除本企业关系。不能删自己，企业至少保留一名管理员。 */
  async removeMember(actor: User, tenantId: string | null, memberId: string) {
    const id = await this.requireConsolePerm(actor, tenantId, 'portal.console.members');
    await this.assertOrgAdmin(actor, id);
    const member = await this.prisma.orgMember.findFirst({
      where: { id: memberId, tenantId: id },
    });
    if (!member) throw new NotFoundException('成员不存在');
    if (member.userId === actor.id) throw new BadRequestException('不能删除自己，请让其他管理员操作');

    const adminPreset = await this.prisma.role.findUnique({
      where: { key: 'org_admin' },
      select: { id: true },
    });
    const isAdmin = adminPreset
      ? await this.prisma.userRole.count({ where: { userId: member.userId, roleId: adminPreset.id } })
      : 0;
    if (isAdmin > 0 && adminPreset) {
      const others = await this.prisma.userRole.count({
        where: {
          roleId: adminPreset.id,
          user: { memberships: { some: { tenantId: id } } },
          userId: { not: member.userId },
        },
      });
      if (others === 0) {
        throw new BadRequestException('企业至少保留一名管理员，请先提升其他成员为管理员');
      }
    }

    // 数据互通：满足条件时连账号一起删（与 admin/users 删除同源）；跨企业/平台角色/平台管理员只解除关系。
    const target = await this.prisma.user.findUnique({
      where: { id: member.userId },
      select: {
        isPlatformAdmin: true,
        _count: { select: { memberships: true } },
      },
    });
    const platformRoleCount = await this.prisma.userRole.count({
      where: { userId: member.userId, role: { scope: RoleScope.PLATFORM } },
    });
    const deleteAccount =
      !!target && !target.isPlatformAdmin && platformRoleCount === 0 && target._count.memberships <= 1;

    await this.prisma.orgMember.delete({ where: { id: member.id } });
    // 摘掉该用户在本企业的角色绑定（企业预设 + 本企业自建），避免游离账号残留企业权限。
    const scoped = await this.prisma.userRole.findMany({
      where: { userId: member.userId },
      include: { role: { select: { id: true, scope: true, tenantId: true } } },
    });
    const toRemove = scoped.filter(
      (ur) =>
        ur.role.scope === RoleScope.ORG_PRESET ||
        (ur.role.scope === RoleScope.ORG_CUSTOM && ur.role.tenantId === id),
    );
    if (toRemove.length) {
      await this.prisma.userRole.deleteMany({
        where: { id: { in: toRemove.map((ur) => ur.id) } },
      });
    }
    if (deleteAccount) {
      await this.prisma.user.delete({ where: { id: member.userId } });
    }
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        tenantId: id,
        action: 'remove_member',
        meta: { memberUserId: member.userId, deletedAccount: deleteAccount },
      },
    });
    return { ok: true };
  }

  /** 企业管理员重置成员密码：不能改自己（走验旧密码流程），平台角色账号请在总后台改。 */
  async changeMemberPassword(actor: User, tenantId: string | null, memberId: string, password: string) {
    const id = await this.requireConsolePerm(actor, tenantId, 'portal.console.members');
    await this.assertOrgAdmin(actor, id);
    const member = await this.prisma.orgMember.findFirst({
      where: { id: memberId, tenantId: id },
    });
    if (!member) throw new NotFoundException('成员不存在');
    if (member.userId === actor.id) {
      throw new BadRequestException('不能修改自己的密码，请用「个人账号 → 修改密码」');
    }
    const target = await this.prisma.user.findUnique({ where: { id: member.userId } });
    if (!target) throw new NotFoundException('用户不存在');
    if (target.isPlatformAdmin) {
      throw new BadRequestException('平台管理员请在总后台修改密码');
    }
    const platformRoleCount = await this.prisma.userRole.count({
      where: { userId: member.userId, role: { scope: RoleScope.PLATFORM } },
    });
    if (platformRoleCount > 0) {
      throw new BadRequestException('平台角色账号请在总后台修改密码');
    }

    await this.prisma.user.update({
      where: { id: member.userId },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        tenantId: id,
        action: 'member_change_password',
        meta: { memberUserId: member.userId },
      },
    });
    return { ok: true };
  }

  /**
   * 最后管理员保护：若本次改绑会摘掉某成员的 org_admin，则企业中必须还有其他成员持有 org_admin，
   * 否则拒绝（企业不能没有管理员）。空 roleIds（回落 org_member）同样视为摘管理员。
   */
  private async assertKeepsOrgAdmin(tenantId: string, userId: string, roleIds: string[]) {
    const adminPreset = await this.prisma.role.findUnique({
      where: { key: 'org_admin' },
      select: { id: true },
    });
    if (!adminPreset) return;
    const next = new Set(roleIds);
    if (next.has(adminPreset.id)) return;
    const targetHasAdmin = await this.prisma.userRole.count({
      where: { userId, roleId: adminPreset.id },
    });
    if (!targetHasAdmin) return;
    const others = await this.prisma.userRole.count({
      where: {
        roleId: adminPreset.id,
        user: { memberships: { some: { tenantId } } },
        userId: { not: userId },
      },
    });
    if (others === 0) {
      throw new BadRequestException('企业至少保留一名管理员，请先提升其他成员为管理员');
    }
  }

  /** 只允许绑企业预设（org_admin/org_member）或本企业自建角色。 */
  private async assertTenantRoleIds(tenantId: string, roleIds: string[]) {
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, key: true, scope: true, tenantId: true },
    });
    if (roles.length !== new Set(roleIds).size) throw new BadRequestException('存在无效角色');
    for (const role of roles) {
      const ok =
        role.scope === RoleScope.ORG_PRESET ||
        (role.scope === RoleScope.ORG_CUSTOM && role.tenantId === tenantId);
      if (!ok) throw new BadRequestException('只能绑定企业预设或本企业自建角色');
    }
  }

  async requireTenant(user: User, tenantId: string | null) {
    if (!tenantId) {
      throw new BadRequestException(user.isPlatformAdmin ? '请先选择租户' : '请先选择企业');
    }
    if (user.isPlatformAdmin) {
      const t = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!t) throw new NotFoundException('租户不存在');
      return tenantId;
    }
    const membership = await this.prisma.orgMember.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
    });
    if (!membership) throw new ForbiddenException('无权访问该企业');
    return tenantId;
  }

  /**
   * 控制台访问权：暂时只校验「是本企业成员」（平台管理员可进任意企业）。
   * 控制台各页面的模块权限后续单独拆分。
   */
  async requireConsoleAdmin(user: User, tenantId: string | null) {
    return this.requireTenant(user, tenantId);
  }


  /**
   * 企业写操作（成员/角色增删改）硬拦：仅企业管理员（org_admin）或平台管理员。
   * 读权限仍走 requireConsolePerm（页面权限）；写在此之上再校验。
   */
  async assertOrgAdmin(user: User, tenantId: string) {
    if (user.isPlatformAdmin) return;
    const isOrgAdmin = await this.prisma.userRole.count({
      where: { userId: user.id, role: { key: 'org_admin' } },
    });
    if (isOrgAdmin) return;
    const membership = await this.prisma.orgMember.findFirst({
      where: {
        userId: user.id,
        tenantId,
        role: { in: [MemberRole.ADMIN, MemberRole.OWNER] },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('需要企业管理员');
    }
  }

  /** 控制台模块权限：成员身份 + 有效权限含指定键（平台管理员直通）。 */
  async requireConsolePerm(user: User, tenantId: string | null, permKey: string) {
    const id = await this.requireTenant(user, tenantId);
    if (user.isPlatformAdmin) return id;
    const eff = await computeEffectivePermissions(this.prisma, user.id, id);
    if (!eff.effectivePermissions.includes(permKey)) {
      throw new ForbiddenException('没有该模块的访问权限');
    }
    return id;
  }
}
