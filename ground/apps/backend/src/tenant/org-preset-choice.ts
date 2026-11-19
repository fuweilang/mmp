/** 同一企业里管理员盖过成员。两边都勾了就只留企业管理员。 */
export function preferOrgAdminRoleIds(
  roleIds: readonly string[],
  presets: readonly { id: string; key: string }[],
): string[] {
  const adminId = presets.find((preset) => preset.key === 'org_admin')?.id;
  const memberId = presets.find((preset) => preset.key === 'org_member')?.id;
  if (!adminId || !memberId || !roleIds.includes(adminId) || !roleIds.includes(memberId)) return [...roleIds];
  return roleIds.filter((id) => id !== memberId);
}
