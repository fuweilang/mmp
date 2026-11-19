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

/** 这一家的企业档。管理员和成员不会同时显示，其它企业的那一档也不带过来。 */
export function enterprisePresetKey(role: MemberRole): 'org_admin' | 'org_member' | null {
  if (role === 'ADMIN' || role === 'OWNER') return 'org_admin';
  if (role === 'MEMBER') return 'org_member';
  return null;
}

/** 刚勾上的企业档留下，另一个企业档去掉。两边一起出现时留管理员。 */
export function chooseOrgPresetIds(
  previous: readonly string[],
  next: readonly string[],
  roles: readonly { id: string; key: string }[],
): string[] {
  const adminId = roles.find((role) => role.key === 'org_admin')?.id;
  const memberId = roles.find((role) => role.key === 'org_member')?.id;
  if (!adminId || !memberId || !next.includes(adminId) || !next.includes(memberId)) return [...next];
  const memberTurnedOn = !previous.includes(memberId) && next.includes(memberId);
  const adminTurnedOn = !previous.includes(adminId) && next.includes(adminId);
  const drop = memberTurnedOn && !adminTurnedOn ? adminId : memberId;
  return next.filter((id) => id !== drop);
}

/** 多角色标签。企业管理员和企业成员只显示这一家成员档对应的那个。 */
export function memberRoles(row: {
  role: MemberRole;
  user?: { roles?: Array<{ role: { id?: string; key: string; name: string } }> };
}) {
  const roles = row.user?.roles ?? [];
  const presetKey = enterprisePresetKey(row.role);
  const visible = roles.filter((item) => item.role.key !== 'org_admin' && item.role.key !== 'org_member' || item.role.key === presetKey);
  if (visible.length > 0) {
    return visible.map((item) => ({
      id: item.role.id,
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
