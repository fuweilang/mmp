import { MemberRoleLabel, type MemberRole } from '@mammoth/shared';

export const ROLE_COLORS: Partial<Record<MemberRole, string>> = {
  ADMIN: '#c2410c',
  MEMBER: '#15803d',
};

export const MEMBER_ROLE_COLORS: Record<string, string> = {
  super_admin: '#7c3aed',
  platform_admin: '#3E468C',
  org_admin: '#0891b2',
  org_member: '#15803d',
};

export function roleLabel(role: MemberRole) {
  return MemberRoleLabel[role];
}

export function roleColor(role: MemberRole) {
  return ROLE_COLORS[role] ?? '#15803d';
}

/** 多角色：每个角色一个标签；接口没有角色时退回历史枚举。 */
export function memberRoles(row: {
  role: MemberRole;
  user?: { roles?: Array<{ role: { key: string; name: string } }> };
}) {
  const roles = row.user?.roles ?? [];
  if (roles.length > 0) {
    return roles.map((item) => ({
      label: item.role.name,
      color: MEMBER_ROLE_COLORS[item.role.key] ?? '#4A53A3',
    }));
  }
  return [{ label: roleLabel(row.role), color: roleColor(row.role) }];
}

export function roleTagStyleByName(color: string) {
  return {
    '--tag-color': color,
    color,
    backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 32%, transparent)`,
  };
}
