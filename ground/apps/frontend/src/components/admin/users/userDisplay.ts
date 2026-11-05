import type { AdminUserRow } from '@/api/admin';

export type RoleTag = { label: string; color: string };

export const TENANT_COLORS = ['#7c3aed', '#0891b2', '#c2410c', '#15803d', '#be123c', '#4f46e5', '#a16207', '#0f766e'];

export const ROLE_COLORS: Record<string, string> = {
  super_admin: '#7c3aed',
  platform_admin: '#3E468C',
  org_admin: '#0891b2',
  org_member: '#15803d',
};

/** 多角色：每个角色一个标签，超级管理员排最前。 */
export function roleTags(row: AdminUserRow): RoleTag[] {
  const keys = row.roleKeys ?? [];
  const names = row.roleNames ?? [];
  let tags = keys.map((key, index) => ({
    label: names[index] ?? key,
    color: ROLE_COLORS[key] ?? '#4A53A3',
    key,
  }));
  // 平台账号只展示平台身份，避免和企业内角色混在一起
  if (tags.some((tag) => tag.key === 'super_admin' || tag.key === 'platform_admin')) {
    tags = tags.filter((tag) => tag.key === 'super_admin' || tag.key === 'platform_admin');
  }
  if (tags.length > 0) {
    return tags
      .map(({ label, color }) => ({ label, color }))
      .sort((a, b) => (a.label === '超级管理员' ? -1 : b.label === '超级管理员' ? 1 : 0));
  }

  const tenant = row.tenants[0];
  if (tenant?.role === 'ADMIN' || tenant?.role === 'OWNER') return [{ label: '企业管理员', color: '#0891b2' }];
  if (tenant?.role === 'MEMBER') return [{ label: '企业成员', color: '#15803d' }];
  return [];
}

export function roleLabel(row: AdminUserRow) {
  const tags = roleTags(row);
  return tags.length ? tags.map((tag) => tag.label).join(' · ') : '普通用户';
}

export function statusLabel(status: string) {
  return status === 'active' ? '激活' : '停用';
}

/** 超管行不提供停用/启用/删除入口。 */
export function isSuperAdminRow(row: AdminUserRow) {
  return row.platformRoleKey === 'super_admin';
}

export function canChangePassword(row: AdminUserRow, actorIsSuperAdmin: boolean) {
  if (row.platformRoleKey === 'super_admin' && !actorIsSuperAdmin) return false;
  return true;
}

/** 只有超级管理员行不提供删除入口，其余一律可删。 */
export function canDeleteUser(row: AdminUserRow) {
  return !isSuperAdminRow(row);
}

export function roleTagStyle(color: string) {
  return {
    backgroundColor: `${color}14`,
    borderColor: color,
    color,
  };
}

export function tenantColor(id: string) {
  let hash = 0;
  for (const character of id) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return TENANT_COLORS[hash % TENANT_COLORS.length];
}
