import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleScope, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import {
  ASSIGNABLE_TENANT_KEYS,
  defaultOrgPresetAssignableKeys,
  getTenantCatalogGrouped,
  isKnownPermissionKey,
  isRoleMutationAllowed,
  sanitizePermissionKeys,
  validatePermissionKeys,
} from '../permissions/catalog';
import {
  loadOrgMemberOverridePermKeys,
  ORG_ADMIN_PRESET_KEY,
  ORG_MEMBER_PRESET_KEY,
  resolveOrgMemberPermKeys,
} from '../permissions/org-preset-override';
import { CreateTenantRoleDto, PatchTenantRoleDto } from './dto/upsert-tenant-role.dto';

/** @deprecated 仅作硬顶兼容；Console 实际以 resolveAssignableKeys() 为准。 */
export const ASSIGNABLE_KEYS = ASSIGNABLE_TENANT_KEYS;

/** 企业控制台列表固定展示的平台预置角色。 */
const ORG_PRESET_KEYS = [ORG_ADMIN_PRESET_KEY, ORG_MEMBER_PRESET_KEY] as const;

@Injectable()
export class TenantRoleService {
  constructor(
    private prisma: PrismaService,
    private tenants: TenantService,
  ) {}

  async list(user: User, tenantId: string | null) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.roles');
    const rows = await this.prisma.role.findMany({
      where: {
        OR: [
          { scope: RoleScope.ORG_PRESET, key: { in: [...ORG_PRESET_KEYS] } },
          { scope: RoleScope.ORG_CUSTOM, tenantId: id },
        ],
      },
      include: { permissions: { select: { permKey: true } }, _count: { select: { users: true } } },
    });

    const presetIds = rows.filter((row) => row.scope === RoleScope.ORG_PRESET).map((row) => row.id);
    const tenantPresetCounts = new Map<string, number>();
    if (presetIds.length) {
      const grouped = await this.prisma.userRole.groupBy({
        by: ['roleId'],
        where: {
          roleId: { in: presetIds },
          user: { memberships: { some: { tenantId: id } } },
        },
        _count: { _all: true },
      });
      for (const item of grouped) {
        tenantPresetCounts.set(item.roleId, item._count._all);
      }
    }

    const memberOverride = await loadOrgMemberOverridePermKeys(this.prisma, id);

    const sorted = [...rows].sort((a, b) => {
      const ai = ORG_PRESET_KEYS.indexOf(a.key as (typeof ORG_PRESET_KEYS)[number]);
      const bi = ORG_PRESET_KEYS.indexOf(b.key as (typeof ORG_PRESET_KEYS)[number]);
      const aPreset = ai >= 0;
      const bPreset = bi >= 0;
      if (aPreset && bPreset) return ai - bi;
      if (aPreset) return -1;
      if (bPreset) return 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    return sorted.map((row) =>
      this.toRow(row, {
        userCount:
          row.scope === RoleScope.ORG_PRESET
            ? (tenantPresetCounts.get(row.id) ?? 0)
            : (row._count?.users ?? 0),
        memberOverride,
      }),
    );
  }

  /** 成员分配可选项：两档企业预设 + 本企业自建角色。 */
  async assignable(user: User, tenantId: string | null) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.roles');
    const rows = await this.prisma.role.findMany({
      where: {
        OR: [
          { scope: RoleScope.ORG_PRESET },
          { scope: RoleScope.ORG_CUSTOM, tenantId: id },
        ],
      },
      select: { id: true, key: true, name: true, scope: true, builtIn: true },
      orderBy: [{ scope: 'asc' }, { createdAt: 'asc' }],
    });
    return rows;
  }

  async catalog(user: User, tenantId: string | null) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.roles');
    const allowed = await this.resolveAssignableKeys(id);
    return { categories: getTenantCatalogGrouped(allowed) };
  }

  async create(user: User, tenantId: string | null, dto: CreateTenantRoleDto) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.roles');
    await this.tenants.assertOrgAdmin(user, id);
    const permKeys = await this.assertAssignableKeys(id, sanitizePermissionKeys(dto.permKeys));
    const role = await this.prisma.role.create({
      data: {
        key: `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        scope: RoleScope.ORG_CUSTOM,
        builtIn: false,
        editable: true,
        tenantId: id,
        permissions: { create: permKeys.map((permKey) => ({ permKey })) },
      },
      include: { permissions: { select: { permKey: true } }, _count: { select: { users: true } } },
    });
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId: id, action: 'create_tenant_role', meta: { roleId: role.id } },
    });
    return this.toRow(role, { memberOverride: await loadOrgMemberOverridePermKeys(this.prisma, id) });
  }

  async patch(user: User, tenantId: string | null, roleId: string, dto: PatchTenantRoleDto) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.roles');
    await this.tenants.assertOrgAdmin(user, id);
    const role = await this.findMutableRole(id, roleId);

    // org_admin：控制台只读，永不改共享行
    if (role.scope === RoleScope.ORG_PRESET && role.key === ORG_ADMIN_PRESET_KEY) {
      throw new ForbiddenException('全局共享，请到平台管理修改');
    }

    // org_member：只写租户覆盖表，绝不改共享 Role / RolePermission
    if (role.scope === RoleScope.ORG_PRESET && role.key === ORG_MEMBER_PRESET_KEY) {
      if (!dto.permKeys) {
        throw new BadRequestException('请提交权限包');
      }
      const permKeys = await this.assertAssignableKeys(id, sanitizePermissionKeys(dto.permKeys));
      await this.upsertOrgMemberOverride(id, permKeys);
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          tenantId: id,
          action: 'upsert_org_member_preset_override',
          meta: { roleId, presetKey: ORG_MEMBER_PRESET_KEY, permCount: permKeys.length },
        },
      });
      return this.getOne(id, roleId);
    }

    if (role.scope === RoleScope.ORG_PRESET) {
      throw new ForbiddenException('全局共享，请到平台管理修改');
    }
    if (!isRoleMutationAllowed(role.key, role.editable)) {
      throw new ForbiddenException(`系统角色「${role.name}」不可编辑`);
    }
    const permKeys = dto.permKeys ? await this.assertAssignableKeys(id, sanitizePermissionKeys(dto.permKeys)) : null;
    await this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
      },
    });
    if (permKeys) {
      // 保存即所得：落库权限包 = 本次提交（经企业可分配目录校验）
      await this.prisma.rolePermission.deleteMany({ where: { roleId } });
      await this.prisma.rolePermission.createMany({
        data: permKeys.map((permKey) => ({ roleId, permKey })),
        skipDuplicates: true,
      });
    }
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        tenantId: id,
        action: 'update_tenant_role',
        meta: { roleId, key: role.key, scope: role.scope },
      },
    });
    return this.getOne(id, roleId);
  }

  async remove(user: User, tenantId: string | null, roleId: string) {
    const id = await this.tenants.requireConsolePerm(user, tenantId, 'portal.console.roles');
    await this.tenants.assertOrgAdmin(user, id);
    const role = await this.findTenantRole(id, roleId);
    const bound = await this.prisma.userRole.count({ where: { roleId } });
    if (bound > 0) throw new BadRequestException(`还有 ${bound} 个成员使用该角色，请先解绑`);
    await this.prisma.role.delete({ where: { id: role.id } });
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId: id, action: 'delete_tenant_role', meta: { roleId } },
    });
    return { ok: true };
  }

  /**
   * Console 可分配目录 = 当前 org_admin∪（本租户 org_member 有效包） ∩ 硬顶。
   * org_member 有效包 = 租户覆盖否则全局预置。
   */
  async resolveAssignableKeys(tenantId?: string | null): Promise<Set<string>> {
    const rows = await this.prisma.role.findMany({
      where: { scope: RoleScope.ORG_PRESET, key: { in: [...ORG_PRESET_KEYS] } },
      include: { permissions: { select: { permKey: true } } },
    });
    const memberOverride = tenantId
      ? await loadOrgMemberOverridePermKeys(this.prisma, tenantId)
      : null;
    const union = new Set<string>();
    for (const row of rows) {
      const raw =
        row.key === ORG_MEMBER_PRESET_KEY
          ? resolveOrgMemberPermKeys(
              row.permissions.map((p) => p.permKey),
              memberOverride,
            )
          : row.permissions.map((p) => p.permKey);
      for (const permKey of raw) {
        if (isKnownPermissionKey(permKey) && ASSIGNABLE_TENANT_KEYS.has(permKey)) {
          union.add(permKey);
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

  private async upsertOrgMemberOverride(tenantId: string, permKeys: string[]) {
    const existing = await this.prisma.orgPresetOverride.findUnique({
      where: { tenantId_presetKey: { tenantId, presetKey: ORG_MEMBER_PRESET_KEY } },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.orgPresetOverridePermission.deleteMany({ where: { overrideId: existing.id } });
      if (permKeys.length) {
        await this.prisma.orgPresetOverridePermission.createMany({
          data: permKeys.map((permKey) => ({ overrideId: existing.id, permKey })),
          skipDuplicates: true,
        });
      }
      await this.prisma.orgPresetOverride.update({
        where: { id: existing.id },
        data: { updatedAt: new Date() },
      });
      return;
    }
    await this.prisma.orgPresetOverride.create({
      data: {
        tenantId,
        presetKey: ORG_MEMBER_PRESET_KEY,
        permissions: { create: permKeys.map((permKey) => ({ permKey })) },
      },
    });
  }

  private async assertAssignableKeys(tenantId: string, keys: string[]) {
    const known = validatePermissionKeys(keys);
    const allowed = await this.resolveAssignableKeys(tenantId);
    const illegal = known.filter((k) => !allowed.has(k));
    if (illegal.length) {
      throw new BadRequestException(`企业角色不可授予这些权限：${illegal.join('、')}`);
    }
    return known;
  }

  /** 删除仅允许本企业自建角色。 */
  private async findTenantRole(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId, scope: RoleScope.ORG_CUSTOM },
      select: { id: true },
    });
    if (!role) throw new NotFoundException('角色不存在');
    return role;
  }

  /**
   * 控制台可改：本企业自建 + 可查出的预置（预置写路径在 patch 分支分流）。
   */
  private async findMutableRole(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        OR: [
          { scope: RoleScope.ORG_PRESET, key: { in: [...ORG_PRESET_KEYS] } },
          { scope: RoleScope.ORG_CUSTOM, tenantId },
        ],
      },
      select: { id: true, key: true, name: true, scope: true, editable: true },
    });
    if (!role) throw new NotFoundException('角色不存在');
    return role;
  }

  private async getOne(tenantId: string, roleId: string) {
    const row = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        OR: [
          { scope: RoleScope.ORG_PRESET, key: { in: [...ORG_PRESET_KEYS] } },
          { scope: RoleScope.ORG_CUSTOM, tenantId },
        ],
      },
      include: { permissions: { select: { permKey: true } }, _count: { select: { users: true } } },
    });
    if (!row) throw new NotFoundException('角色不存在');
    const memberOverride = await loadOrgMemberOverridePermKeys(this.prisma, tenantId);
    let userCount = row._count?.users ?? 0;
    if (row.scope === RoleScope.ORG_PRESET) {
      userCount = await this.prisma.userRole.count({
        where: { roleId: row.id, user: { memberships: { some: { tenantId } } } },
      });
    }
    return this.toRow(row, { userCount, memberOverride });
  }

  private toRow(
    row: {
      id: string;
      key: string;
      name: string;
      description: string | null;
      scope: RoleScope;
      builtIn: boolean;
      editable: boolean;
      permissions: Array<{ permKey: string }>;
      createdAt: Date;
      updatedAt: Date;
      _count?: { users: number };
    },
    override?: { userCount?: number; memberOverride?: string[] | null },
  ) {
    const globalPermKeys = row.permissions
      .map((p) => p.permKey)
      .filter((k) => isKnownPermissionKey(k))
      .sort();
    const isMemberPreset = row.scope === RoleScope.ORG_PRESET && row.key === ORG_MEMBER_PRESET_KEY;
    const hasTenantOverride = isMemberPreset && Array.isArray(override?.memberOverride);
    const permKeys = isMemberPreset
      ? resolveOrgMemberPermKeys(globalPermKeys, override?.memberOverride ?? null)
      : globalPermKeys;

    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      scope: row.scope,
      builtIn: row.builtIn,
      // 控制台：org_admin 只读；org_member 可经覆盖路径编辑；自定义看 DB editable。
      editable:
        row.scope === RoleScope.ORG_CUSTOM
          ? row.editable
          : row.key === ORG_MEMBER_PRESET_KEY,
      permKeys,
      hasTenantOverride: isMemberPreset ? hasTenantOverride : false,
      permSource: isMemberPreset ? (hasTenantOverride ? 'tenant' : 'global') : row.scope === RoleScope.ORG_PRESET ? 'global' : 'tenant',
      userCount: override?.userCount ?? row._count?.users ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
