import type { PermissionCatalogGroup, PermissionCatalogPage } from '@/api/admin';
import type { RoleRow } from './roleTypes';

export const ROLE_COLORS: Record<string, string> = {
  super_admin: '#7c3aed',
  platform_admin: '#3E468C',
  org_admin: '#0891b2',
  org_member: '#15803d',
};

export const TENANT_COLORS = ['#7c3aed', '#0891b2', '#c2410c', '#15803d', '#be123c', '#4f46e5', '#a16207', '#0f766e'];

export const BUILTIN_ROLE_KEY_SET = new Set(['super_admin', 'platform_admin', 'org_admin', 'org_member']);

export function isBuiltinRoleRow(row: RoleRow) {
  return row.builtIn || BUILTIN_ROLE_KEY_SET.has(row.key);
}

export function scopeLabel(scope: string) {
  if (scope === 'PLATFORM') return '平台';
  if (scope === 'ORG_PRESET') return '企业预设';
  return '企业自定义';
}

export function roleColor(key: string) {
  return ROLE_COLORS[key] || '#64748b';
}

export function tenantColor(id: string) {
  let hash = 0;
  for (const character of id) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return TENANT_COLORS[hash % TENANT_COLORS.length];
}

export function roleTagStyle(key: string) {
  const color = roleColor(key);
  return {
    backgroundColor: `${color}14`,
    borderColor: color,
    color,
  };
}

export function groupPages(group: PermissionCatalogGroup): PermissionCatalogPage[] {
  if (group.pages?.length) return group.pages;
  return [{ page: null, pageZh: '', pageEn: '', items: group.items }];
}

export function pageSelectedCount(page: PermissionCatalogPage, set: Set<string>) {
  const on = page.items.filter((item) => set.has(item.key)).length;
  return `${on}/${page.items.length}`;
}

export function groupSelectedCount(group: PermissionCatalogGroup, set: Set<string>) {
  const items = groupPages(group).flatMap((page) => page.items);
  const on = items.filter((item) => set.has(item.key)).length;
  return `${on}/${items.length}`;
}
