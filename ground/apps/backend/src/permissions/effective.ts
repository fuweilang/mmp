import { MemberRole, Prisma, RoleScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isKnownPermissionKey } from './catalog';
import {
  loadOrgMemberOverridePermKeys,
  ORG_ADMIN_PRESET_KEY,
  ORG_MEMBER_PRESET_KEY,
  resolveOrgMemberPermKeys,
} from './org-preset-override';

const ORG_PRESET_KEY: Record<MemberRole, string> = {
  // 企业侧只有两档：管理员与成员（OWNER 为历史值，按管理员处理）
  OWNER: 'org_admin',
  ADMIN: 'org_admin',
  MEMBER: 'org_member',
};

/** 拥有该权限 = 可进总后台（/admin）。 */
export const ADMIN_ACCESS_PERM = 'portal.admin.access';

export type EffectiveResult = {
  effectivePermissions: string[];
  platformRoleKey: string | null;
  isPlatformAdmin: boolean;
};

/** 用户已绑定角色及其权限包（供查看弹窗标注权限来源）。 */
export type RolePermSource = {
  key: string;
  name: string;
  scope: string;
  permKeys: string[];
};

type Db = PrismaService | Prisma.TransactionClient;

/**
 * 用户在给定租户上下文下的有效权限并集。
 * - PLATFORM：始终计入
 * - ORG_PRESET org_admin：租户内管理员（OrgMember.role ADMIN/OWNER）或平台管理员才计入
 * - ORG_PRESET org_member：tenant 覆盖优先，否则全局
 * - ORG_CUSTOM：仅当 role.tenantId === tenantId
 * tenantId 为空时不计企业自定义角色；org_member 回退全局包。
 */
export async function computeEffectivePermissions(
  db: Db,
  userId: string,
  tenantId: string | null,
): Promise<EffectiveResult> {
  const rows = await db.userRole.findMany({
    where: { userId },
    select: {
      role: {
        select: {
          key: true,
          scope: true,
          tenantId: true,
          permissions: { select: { permKey: true } },
        },
      },
    },
  });

  const memberOverride = await loadOrgMemberOverridePermKeys(db, tenantId);
  const keys = new Set<string>();
  const platformRoles = rows
    .map((row) => row.role)
    .filter((role) => role.scope === RoleScope.PLATFORM);
  // 企业管理员以租户成员档为准；平台管理员不受租户成员档限制。
  const platformAdmin = platformRoles.some((role) =>
    role.permissions.some((p) => p.permKey === ADMIN_ACCESS_PERM && isKnownPermissionKey(p.permKey)));
  const membership = tenantId && !platformAdmin
    ? await db.orgMember.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { role: true },
    })
    : null;
  const tenantAdmin = membership?.role === MemberRole.ADMIN || membership?.role === MemberRole.OWNER;

  for (const role of rows.map((row) => row.role)) {
    if (role.scope === RoleScope.PLATFORM) {
      for (const p of role.permissions) {
        if (isKnownPermissionKey(p.permKey)) keys.add(p.permKey);
      }
      continue;
    }

    if (role.scope === RoleScope.ORG_CUSTOM) {
      if (!tenantId || role.tenantId !== tenantId) continue;
      for (const p of role.permissions) {
        if (isKnownPermissionKey(p.permKey)) keys.add(p.permKey);
      }
      continue;
    }

    if (role.scope === RoleScope.ORG_PRESET) {
      if (role.key === ORG_MEMBER_PRESET_KEY) {
        const globalKeys = role.permissions.map((p) => p.permKey);
        for (const k of resolveOrgMemberPermKeys(globalKeys, memberOverride)) {
          keys.add(k);
        }
      } else {
        // 非平台管理员只有在目标租户内担任 ADMIN/OWNER 时才获得 org_admin 预设包。
        if (role.key === ORG_ADMIN_PRESET_KEY && tenantId && !platformAdmin && !tenantAdmin) continue;
        for (const p of role.permissions) {
          if (isKnownPermissionKey(p.permKey)) keys.add(p.permKey);
        }
      }
    }
  }

  // 平台身份取超级管理员优先，其次第一个平台角色
  const platformRoleKey = platformRoles.find((role) => role.key === 'super_admin')?.key
    ?? platformRoles[0]?.key
    ?? null;

  return {
    effectivePermissions: [...keys].sort(),
    platformRoleKey,
    // 总后台身份看权限，不看角色 scope：只有授了总后台权限才算平台管理员。
    isPlatformAdmin: keys.has(ADMIN_ACCESS_PERM),
  };
}

export function orgPresetKeyFor(role: MemberRole): string {
  return ORG_PRESET_KEY[role];
}

/** 列出用户在租户上下文下计入的角色及各自权限包（已知 key）。 */
export async function listBoundRoleSources(
  db: Db,
  userId: string,
  tenantId: string | null = null,
): Promise<RolePermSource[]> {
  const rows = await db.userRole.findMany({
    where: { userId },
    select: {
      role: {
        select: {
          key: true,
          name: true,
          scope: true,
          tenantId: true,
          permissions: { select: { permKey: true } },
        },
      },
    },
  });
  const memberOverride = await loadOrgMemberOverridePermKeys(db, tenantId);
  const platformAdmin = rows.some((row) => row.role.scope === RoleScope.PLATFORM
    && row.role.permissions.some((p) => p.permKey === ADMIN_ACCESS_PERM && isKnownPermissionKey(p.permKey)));
  const membership = tenantId && !platformAdmin
    ? await db.orgMember.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { role: true },
    })
    : null;
  const tenantAdmin = membership?.role === MemberRole.ADMIN || membership?.role === MemberRole.OWNER;
  const out: RolePermSource[] = [];
  for (const row of rows) {
    const role = row.role;
    if (role.scope === RoleScope.ORG_CUSTOM) {
      if (!tenantId || role.tenantId !== tenantId) continue;
    }
    // 与 computeEffectivePermissions 同源：非本企业管理员不计入 org_admin 预置包。
    if (role.scope === RoleScope.ORG_PRESET && role.key === ORG_ADMIN_PRESET_KEY && tenantId && !platformAdmin && !tenantAdmin) continue;
    let permKeys = role.permissions
      .map((p) => p.permKey)
      .filter((k) => isKnownPermissionKey(k));
    if (role.scope === RoleScope.ORG_PRESET && role.key === ORG_MEMBER_PRESET_KEY) {
      permKeys = resolveOrgMemberPermKeys(permKeys, memberOverride);
    } else {
      permKeys = [...new Set(permKeys)].sort();
    }
    out.push({
      key: role.key,
      name: role.name,
      scope: role.scope,
      permKeys,
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
