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
import { CreateAdminEnterpriseDto } from './dto/create-admin-enterprise.dto';
import { UpdateAdminEnterpriseDto } from './dto/update-admin-enterprise.dto';
import { ASSIGNABLE_TENANT_KEYS, BUILTIN_ROLE_KEYS, ROLE_META, defaultOrgPresetAssignableKeys, getTenantCatalogGrouped, isKnownPermissionKey, isRoleMutationAllowed, sanitizePermissionKeys, validatePermissionKeys } from '../permissions/catalog';
import {
  CreateAdminTenantRoleDto,
  ListAdminTenantRolesDto,
  UpdateAdminTenantRoleDto,
} from './dto/tenant-role.dto';
import { ADMIN_ACCESS_PERM, computeEffectivePermissions, listBoundRoleSources } from '../permissions/effective';
import { ListAdminRolesDto } from './dto/list-admin-roles.dto';
import { CreateAdminRoleDto } from './dto/create-admin-role.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';
import { creditSignupGiftInTx } from '../billing/welcome-gift';

export const userSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  isPlatformAdmin: true,
  status: true,
  createdAt: true,
  memberships: {
    select: { role: true, tenant: { select: { id: true, name: true, status: true } } },
    orderBy: { createdAt: 'asc' },
  },
  roles: {
    select: {
      role: {
        select: { key: true, name: true, scope: true, permissions: { select: { permKey: true } } },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.UserSelect;

export const enterpriseSelect = {
  id: true,
  name: true,
  slug: true,
  type: true,
  status: true,
  createdAt: true,
  _count: { select: { members: true } },
  parents: { select: { parent: { select: { id: true, name: true } } }, take: 1 },
  aiWallet: { select: { balanceCoins: true, totalCredited: true, totalDebited: true } },
  // 企业管理员 = 组织成员中角色为 ADMIN（含历史 OWNER）的用户，可多人
  members: {
    // 企业管理员 = 拥有「企业管理员」角色的成员
    where: { user: { roles: { some: { role: { key: 'org_admin' } } } } },
    select: { user: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.TenantSelect;

/** 是否为「平台运营」身份（isPlatformAdmin 语义）：仅超管/平台管理员。 */
type RoleWithPerms = { key: string; permissions?: Array<{ permKey: string }> };
export function roleGrantsAdmin(role: RoleWithPerms | null | undefined) {
  if (!role) return false;
  return role.key === 'super_admin' || role.key === 'platform_admin';
}

/** 平台账号只能是这两个内置角色；其它角色（含自建）都是企业内角色。 */
export function isPlatformAccountKey(key: string | null | undefined) {
  return key === 'super_admin' || key === 'platform_admin';
}

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;
type EnterpriseRow = Prisma.TenantGetPayload<{ select: typeof enterpriseSelect }>;

@Injectable()

@Injectable()
export class AdminSupportService {
  constructor(private prisma: PrismaService) {}

  requirePlatformAdmin(actor: User) {
    if (!actor.isPlatformAdmin) throw new ForbiddenException('仅平台管理员可访问总后台');
  }

  /** 当前账号的全部角色 key。 */
  async getRoleKeys(userId: string) {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { key: true } } },
    });
    return rows.map((row) => row.role.key);
  }

  /** 非超管不得操作（停用/删除/改密）超级管理员。 */
  async assertCanManageSuperAdmin(actor: User, targetKeys: string[], action: string) {
    if (!targetKeys.includes('super_admin')) return;
    if (!(await this.getRoleKeys(actor.id)).includes('super_admin')) {
      throw new ForbiddenException(`平台管理员不能对超级管理员执行「${action}」操作`);
    }
  }

  /** Public wrapper for other admin controllers (catalog etc.). */
  requirePlatformAdminPublic(actor: User) {
    this.requirePlatformAdmin(actor);
  }

  /**
   * 总后台数据范围：
   * - 平台管理员 → null（全量）；
   * 一期已不提供代理商管理员内置角色；非平台身份不可进总后台。
   * scope !== null 的守卫仍保留，便于日后恢复树形数据范围。
   */
  async adminScope(actor: User): Promise<string[] | null> {
    if (actor.isPlatformAdmin) return null;
    throw new ForbiddenException('仅平台管理员可访问总后台');
  }

  /** 校验 tenantId 在数据范围内（null 范围=平台管理员，不校验）。 */
  async assertTenantInScope(scope: string[] | null, tenantId: string, label = '企业') {
    if (scope === null) return;
    if (!scope.includes(tenantId)) {
      throw new ForbiddenException(`该${label}不在你的管理范围内`);
    }
  }

  async findRoleOrThrow(key: string) {
    const role = await this.prisma.role.findUnique({
      where: { key },
      include: { permissions: { select: { permKey: true } } },
    });
    if (!role) throw new BadRequestException(`角色不存在: ${key}`);
    return role;
  }

  /** 覆盖用户角色（多选，权限取并集）。 */
  async setUserRoles(
    tx: Prisma.TransactionClient,
    userId: string,
    roles: Array<{ id: string; key: string; permissions: Array<{ permKey: string }> }>,
  ) {
    await tx.userRole.deleteMany({ where: { userId } });
    if (roles.length > 0) {
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId, roleId: role.id })),
        skipDuplicates: true,
      });
    }
    await tx.user.update({
      where: { id: userId },
      data: { isPlatformAdmin: roles.some((role) => roleGrantsAdmin(role)) },
    });
  }

  /** 成员关系上的历史枚举：只是给控制台列表用的兜底展示。 */
  membershipRole(roles: Array<{ key: string }>): MemberRole {
    return roles.some((role) => role.key === 'org_admin') ? MemberRole.ADMIN : MemberRole.MEMBER;
  }

  /** 前端传 roleKeys；兼容旧的单个 platformRoleKey。 */
  resolveRoleKeys(dto: { roleKeys?: string[]; platformRoleKey?: string | null; isPlatformAdmin?: boolean }) {
    if (dto.roleKeys !== undefined) return Array.from(new Set(dto.roleKeys.filter(Boolean)));
    if (dto.platformRoleKey) return [dto.platformRoleKey];
    return dto.isPlatformAdmin ? ['platform_admin'] : [];
  }

  /** 一次取回所有角色（含权限），顺序按传入的 key。 */
  async loadRoles(keys: string[]) {
    if (keys.length === 0) return [];
    const roles = await this.prisma.role.findMany({
      where: { key: { in: keys } },
      include: { permissions: { select: { permKey: true } } },
    });
    const missing = keys.filter((key) => !roles.some((role) => role.key === key));
    if (missing.length > 0) throw new BadRequestException(`角色不存在: ${missing.join(', ')}`);
    return keys.map((key) => roles.find((role) => role.key === key)!);
  }

  presentUser(user: UserRow) {
    const roles = user.roles.map((row) => row.role);
    const roleKeys = roles.map((role) => role.key);
    // 平台身份取第一个总后台角色；超级管理员优先
    const platformRole = roles.find((role) => role.key === 'super_admin')
      ?? roles.find((role) => roleGrantsAdmin(role))
      ?? null;
    const platformRoleKey = platformRole?.key ?? null;
    const platformRoleName = platformRole?.name ?? null;
    const platformRoleScope = platformRole?.scope ?? null;
    // 总后台身份由角色权限决定，不能只看 scope（自建角色可能是 PLATFORM 但没有任何总后台权限）
    const isPlatformAdmin = roles.some((role) => roleGrantsAdmin(role));
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      isPlatformAdmin,
      platformRoleKey,
      platformRoleName,
      platformRoleScope,
      status: user.status,
      // 推导状态：所属企业全部被停用的用户，在用户管理里也表现为停用（不改 user.status）。
      blockedByTenant:
        user.memberships.length > 0
        && user.memberships.every((m) => m.tenant.status !== 'active'),
      createdAt: user.createdAt,
      roleKeys,
      roleNames: roles.map((role) => role.name),
      tenants: user.memberships.map((m) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        role: m.role,
      })),
    };
  }

  presentEnterprise(tenant: EnterpriseRow) {
    const admins = tenant.members.map((member) => member.user);
    const parent = tenant.parents[0]?.parent ?? null;
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      type: tenant.type,
      status: tenant.status,
      createdAt: tenant.createdAt,
      memberCount: tenant._count.members,
      admins,
      adminCount: admins.length,
      /** 上级：直属企业为 null（页面显示「猛犸总部」）；代理商二期显示代理商名。 */
      parentId: parent?.id ?? null,
      parentName: parent?.name ?? null,
      balanceCoins: tenant.aiWallet?.balanceCoins ?? 0,
      totalCreditedCoins: tenant.aiWallet?.totalCredited ?? 0,
      totalDebitedCoins: tenant.aiWallet?.totalDebited ?? 0,
    };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('用户不存在');
    return this.presentUser(user);
  }

  async getEnterprise(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id }, select: enterpriseSelect });
    if (!tenant) throw new NotFoundException('企业不存在');
    return this.presentEnterprise(tenant);
  }

  /** Validate perm keys against catalog; throws BadRequestException on unknown. */
  assertKnownPermissionKeys(keys: string[]) {
    try {
      return validatePermissionKeys(keys);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  async assertUserInScope(scope: string[] | null, id: string) {
    if (scope === null) return;
    const inScope = await this.prisma.orgMember.count({
      where: { userId: id, tenantId: { in: scope } },
    });
    if (inScope === 0) throw new ForbiddenException('该用户不在你的管理范围内');
  }

  async actorHasRolesWrite(actor: User) {
    const eff = await computeEffectivePermissions(this.prisma, actor.id, null);
    if (eff.effectivePermissions.includes('portal.admin.roles.write')) return true;
    // 超管/平台管按身份放开（与删除角色闸一致），不依赖权限包是否含 roles.write
    const keys = await this.getRoleKeys(actor.id);
    if (keys.includes('super_admin') || keys.includes('platform_admin')) return true;
    // Fallback: legacy super flag without role row yet
    return Boolean(actor.isPlatformAdmin && eff.platformRoleKey === 'super_admin');
  }

  /** 删除自定义角色：仅超管/平台管（按角色身份，不依赖 roles.write）。 */
  async assertActorCanDeleteCustomRoles(actor: User) {
    const keys = await this.getRoleKeys(actor.id);
    if (keys.includes('super_admin') || keys.includes('platform_admin')) return;
    throw new ForbiddenException('仅超级管理员、平台管理员可删除角色');
  }

  isBuiltinRoleKey(key: string) {
    return (BUILTIN_ROLE_KEYS as readonly string[]).includes(key);
  }

  presentRole(role: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    scope: string;
    builtIn: boolean;
    editable: boolean;
    permissions: Array<{ permKey: string }>;
    _count?: { users: number };
  }) {
    // 过滤已退役权限键，避免前端回传导致 PATCH 400。
    const permissions = role.permissions
      .map((p) => p.permKey)
      .filter((k) => isKnownPermissionKey(k))
      .sort();
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      scope: role.scope,
      builtIn: role.builtIn,
      editable: role.editable,
      // 仅 super_admin 硬锁；其余角色可编辑（前端据此禁用 Edit/权限 chip）
      permissionsLocked: !isRoleMutationAllowed(role.key, role.editable),
      permissions,
      userCount: role._count?.users ?? 0,
    };
  }

  nextCustomRoleKey() {
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    return `custom_${suffix}`;
  }

  async resolveOrgPresetAssignableKeys(): Promise<Set<string>> {
    const rows = await this.prisma.role.findMany({
      where: { scope: 'ORG_PRESET', key: { in: ['org_admin', 'org_member'] } },
      include: { permissions: { select: { permKey: true } } },
    });
    const union = new Set<string>();
    for (const row of rows) {
      for (const p of row.permissions) {
        if (isKnownPermissionKey(p.permKey) && ASSIGNABLE_TENANT_KEYS.has(p.permKey)) {
          union.add(p.permKey);
        }
      }
    }
    if (union.size === 0) {
      return new Set(
        [...defaultOrgPresetAssignableKeys()].filter((k) => ASSIGNABLE_TENANT_KEYS.has(k)),
      );
    }
    return union;
  }

  async assertAssignableKeys(keys: string[]) {
    const known = validatePermissionKeys(keys);
    const allowed = await this.resolveOrgPresetAssignableKeys();
    const illegal = known.filter((k) => !allowed.has(k));
    if (illegal.length) {
      throw new BadRequestException(`企业角色不可授予这些权限：${illegal.join('、')}`);
    }
    return known;
  }

  async replaceRolePermissions(roleId: string, keys: string[]) {
    const existing = await this.prisma.rolePermission.findMany({
      where: { roleId },
      select: { id: true, permKey: true },
    });
    const want = new Set(keys);
    const have = new Set(existing.map((e) => e.permKey));
    const toDelete = existing.filter((e) => !want.has(e.permKey)).map((e) => e.id);
    if (toDelete.length) {
      await this.prisma.rolePermission.deleteMany({ where: { id: { in: toDelete } } });
    }
    const toAdd = keys.filter((k) => !have.has(k));
    if (toAdd.length) {
      await this.prisma.rolePermission.createMany({
        data: toAdd.map((permKey) => ({ roleId, permKey })),
        skipDuplicates: true,
      });
    }
  }

  /** 子企业/自定义智能体/知识库属于真实业务资产，仍拦截删除；用量日志随租户一并清理。 */
  hasEnterpriseBusinessData(tenant: {
    agents: Array<{ name: string }>;
    _count: {
      children: number;
      kbFolders: number;
      kbDocuments: number;
    };
  }) {
    const customAgents = tenant.agents.filter((agent) => agent.name !== '企业助手');
    return tenant._count.children > 0
      || customAgents.length > 0
      || tenant._count.kbFolders > 0
      || tenant._count.kbDocuments > 0;
  }

  async computeEnterpriseDeletionImpact(actor: User, id: string) {
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

    const members = await this.prisma.orgMember.findMany({
      where: { tenantId: id },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            isPlatformAdmin: true,
            memberships: { select: { tenantId: true } },
          },
        },
      },
    });
    const removable = members
      .map((member) => member.user)
      .filter((user) =>
        user.id !== actor.id
        && !user.isPlatformAdmin
        && user.memberships.length === 1,
      );

    const customAgents = tenant.agents.filter((agent) => agent.name !== '企业助手');
    const blockedReasons: string[] = [];
    if (tenant._count.children > 0) blockedReasons.push(`有 ${tenant._count.children} 个子企业`);
    if (customAgents.length > 0) blockedReasons.push(`有 ${customAgents.length} 个自定义智能体`);
    if (tenant._count.kbFolders > 0) blockedReasons.push(`有 ${tenant._count.kbFolders} 个知识库目录`);
    if (tenant._count.kbDocuments > 0) blockedReasons.push(`有 ${tenant._count.kbDocuments} 篇知识库文档`);

    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      memberCount: members.length,
      deletedUsers: removable.map((user) => ({ id: user.id, name: user.name, phone: user.phone })),
      unboundMemberCount: members.length - removable.length,
      usageEventCount: tenant._count.usageEvents,
      blockedReasons,
      canDelete: blockedReasons.length === 0,
    };
  }

}
