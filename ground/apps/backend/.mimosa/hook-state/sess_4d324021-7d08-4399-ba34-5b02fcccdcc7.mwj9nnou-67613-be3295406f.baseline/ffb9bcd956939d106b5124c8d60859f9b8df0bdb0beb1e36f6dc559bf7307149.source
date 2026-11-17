/**
 * Permission catalog (ground) — portal.* only.
 * Source of truth for chip UI / RolePermission validation。
 * 已移出的键（含旧 Octop：tasks/token_usage/skills/subagents/tools/agent_plugins/terminal/browser）
 * 在读出时由 sanitizePermissionKeys / isKnownPermissionKey 丢弃。seed 会删掉 RolePermission 与企业覆盖里的残留行。
 */

export type PermissionCategory =
  | 'admin'
  | 'portal_admin'
  | 'portal_console';

export interface PermissionDef {
  key: string;
  category: PermissionCategory;
  labelZh: string;
  labelEn: string;
  page?: string;
  pageZh?: string;
  pageEn?: string;
}

function p(
  key: string,
  category: PermissionCategory,
  labelZh: string,
  labelEn: string,
  extra: Partial<Pick<PermissionDef, 'page' | 'pageZh' | 'pageEn'>> = {},
): PermissionDef {
  return { key, category, labelZh, labelEn, ...extra };
}

/** Portal keys（ground /admin + /console）。页面级，不拆到按钮。 */
export const PORTAL_PERMISSIONS: PermissionDef[] = [
  p('portal.admin.access', 'portal_admin', '进入总后台', 'Access admin'),
  p('portal.admin.users', 'portal_admin', '用户管理', 'Manage users'),
  p('portal.admin.enterprises', 'portal_admin', '企业管理', 'Manage enterprises'),
  p('portal.admin.roles.read', 'portal_admin', '查看角色', 'Read roles'),
  p('portal.admin.roles.write', 'portal_admin', '编辑角色', 'Write roles'),
  p('portal.admin.audit', 'portal_admin', '操作审计', 'Admin operation audit'),
  p('portal.console.access', 'portal_console', '进入企业控制台', 'Access console'),
  p('portal.console.workbench', 'portal_console', '工作台', 'Workbench'),
  p('portal.console.kb', 'portal_console', '知识库管理', 'Manage knowledge base'),
  p('portal.console.members', 'portal_console', '成员管理', 'Manage members'),
  p('portal.console.roles', 'portal_console', '角色管理', 'Manage roles'),
  p('portal.console.usage', 'portal_console', '操作审计', 'Operation audit'),
  p('portal.console.settings', 'portal_console', '企业设置', 'Console settings'),
  p('portal.console.billing', 'portal_console', '充值', 'Billing / Recharge'),
];

export const PERMISSION_CATALOG: PermissionDef[] = [...PORTAL_PERMISSIONS];

export const ALL_PERMISSION_KEYS: ReadonlySet<string> = new Set(
  PERMISSION_CATALOG.map((d) => d.key),
);

export const PORTAL_ADMIN_KEYS = PORTAL_PERMISSIONS.filter((d) =>
  d.key.startsWith('portal.admin.'),
).map((d) => d.key);

export const PORTAL_CONSOLE_KEYS = PORTAL_PERMISSIONS.filter((d) =>
  d.key.startsWith('portal.console.'),
).map((d) => d.key);

/** 企业角色可勾选硬顶：企业控制台 8 个页面。不含总后台。 */
export const ASSIGNABLE_TENANT_KEYS: ReadonlySet<string> = new Set(PORTAL_CONSOLE_KEYS);

/** 按允许键过滤分组目录（与 getCatalogGrouped 同结构）。 */
export function filterCatalogGroupedByKeys(allowed: ReadonlySet<string>): CatalogGroup[] {
  return getCatalogGrouped()
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowed.has(item.key)),
      pages: group.pages
        .map((page) => ({
          ...page,
          items: page.items.filter((item) => allowed.has(item.key)),
        }))
        .filter((page) => page.items.length > 0),
    }))
    .filter((group) => group.items.length > 0);
}

/** 企业角色编辑器的目录：默认按硬顶；Console 应传入 org_admin∪org_member 动态并集。 */
export function getTenantCatalogGrouped(allowedKeys?: ReadonlySet<string>): CatalogGroup[] {
  return filterCatalogGroupedByKeys(allowedKeys ?? ASSIGNABLE_TENANT_KEYS);
}

export const BUILTIN_ROLE_KEYS = [
  'super_admin',
  'platform_admin',
  'org_admin',
  'org_member',
] as const;

export type BuiltinRoleKey = (typeof BUILTIN_ROLE_KEYS)[number];

function uniqSorted(keys: string[]): string[] {
  return [...new Set(keys)].sort();
}

/**
 * 内置默认包：
 * - org_member：空。对话不设权限键。
 * - org_admin：全部 portal.console.*
 * - platform_admin：全部 portal.admin.*
 * - super_admin：当前目录全量
 */
export const ROLE_PERMISSION_PACKS: Record<BuiltinRoleKey, string[]> = {
  super_admin: uniqSorted([...ALL_PERMISSION_KEYS]),
  platform_admin: uniqSorted([...PORTAL_ADMIN_KEYS]),
  org_admin: uniqSorted([...PORTAL_CONSOLE_KEYS]),
  org_member: [],
};

/** 代码默认包并集（DB 预置角色缺失时的回退）。 */
export function defaultOrgPresetAssignableKeys(): ReadonlySet<string> {
  return new Set([
    ...ROLE_PERMISSION_PACKS.org_admin,
    ...ROLE_PERMISSION_PACKS.org_member,
  ]);
}

export const ROLE_META: Record<
  BuiltinRoleKey,
  {
    name: string;
    description: string;
    scope: 'PLATFORM' | 'ORG_PRESET';
    editable: boolean;
  }
> = {
  super_admin: {
    name: '超级管理员',
    description: '系统最高权限：平台后台全部功能，可管理所有企业、用户和角色。建议只给 1–2 位负责人。',
    scope: 'PLATFORM',
    editable: false,
  },
  platform_admin: {
    name: '平台管理员',
    description: '平台运营：可管理企业、用户与角色。不能进入企业控制台。',
    scope: 'PLATFORM',
    editable: true,
  },
  org_admin: {
    name: '企业管理员',
    description: '企业管理员：全部企业控制台页面。',
    scope: 'ORG_PRESET',
    editable: true,
  },
  org_member: {
    name: '企业成员',
    description: '普通员工：默认不进入企业控制台。对话不设权限。',
    scope: 'ORG_PRESET',
    editable: true,
  },
};

/**
 * 角色变更闸：仅 `super_admin` 硬锁（全选且不可改 name/description/permissions）。
 * 其余内置/自定义角色允许持有 roles.write（或超管/平台管身份）的操作者编辑。
 */
export function isRoleMutationAllowed(key: string, _dbEditable?: boolean): boolean {
  return key !== 'super_admin';
}

export const CATEGORY_LABELS: Record<
  PermissionCategory,
  { labelZh: string; labelEn: string }
> = {
  admin: { labelZh: '其他', labelEn: 'Other' },
  portal_admin: { labelZh: '总后台', labelEn: 'Portal admin' },
  portal_console: { labelZh: '企业控制台', labelEn: 'Portal console' },
};

export function isKnownPermissionKey(key: string): boolean {
  return ALL_PERMISSION_KEYS.has(key);
}

/** Deduped keys or throws Error with unknown list (caller maps to HTTP 400). */
export function validatePermissionKeys(keys: string[]): string[] {
  const unknown = [...new Set(keys.filter((k) => !ALL_PERMISSION_KEYS.has(k)))].sort();
  if (unknown.length) {
    throw new Error(`unknown permission keys: ${unknown.join(', ')}`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

/** Drop retired/stale keys so role edits can save（含旧 Octop 垃圾/安装级 key）。 */
export function sanitizePermissionKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    if (!ALL_PERMISSION_KEYS.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export interface CatalogChipItem {
  key: string;
  labelZh: string;
  labelEn: string;
  page?: string;
  pageZh?: string;
  pageEn?: string;
}

export interface CatalogPageBlock {
  /** null = flat chips under the category (no page subtitle) */
  page: string | null;
  pageZh: string;
  pageEn: string;
  items: CatalogChipItem[];
}

export interface CatalogGroup {
  category: PermissionCategory;
  labelZh: string;
  labelEn: string;
  /** Flat list (compat); same keys as pages flattened. */
  items: CatalogChipItem[];
  /** Page blocks for chip pickers. */
  pages: CatalogPageBlock[];
}

/**
 * Chip picker 布局：category → chips。只保留总后台与企业控制台。
 */
const PICKER_LAYOUT: readonly {
  category: PermissionCategory;
  pages: readonly { page: string | null; pageZh: string; pageEn: string; keys: readonly string[] }[];
}[] = [
  {
    category: 'portal_admin',
    pages: [
      {
        page: null,
        pageZh: '',
        pageEn: '',
        keys: [
          'portal.admin.access',
          'portal.admin.users',
          'portal.admin.enterprises',
          'portal.admin.roles.read',
          'portal.admin.roles.write',
          'portal.admin.audit',
        ],
      },
    ],
  },
  {
    category: 'portal_console',
    pages: [
      {
        page: null,
        pageZh: '',
        pageEn: '',
        keys: [
          'portal.console.access',
          'portal.console.workbench',
          'portal.console.kb',
          'portal.console.members',
          'portal.console.roles',
          'portal.console.usage',
          'portal.console.settings',
          'portal.console.billing',
        ],
      },
    ],
  },
];

function chipFromDef(d: PermissionDef): CatalogChipItem {
  return {
    key: d.key,
    labelZh: d.labelZh,
    labelEn: d.labelEn,
    page: d.page,
    pageZh: d.pageZh,
    pageEn: d.pageEn,
  };
}

/** Grouped catalog for chip pickers. */
export function getCatalogGrouped(): CatalogGroup[] {
  const byKey = new Map(PERMISSION_CATALOG.map((d) => [d.key, d]));
  const covered = new Set<string>();
  const groups: CatalogGroup[] = [];

  for (const section of PICKER_LAYOUT) {
    const labels = CATEGORY_LABELS[section.category];
    const pages: CatalogPageBlock[] = [];
    const items: CatalogChipItem[] = [];
    for (const block of section.pages) {
      const blockItems: CatalogChipItem[] = [];
      for (const key of block.keys) {
        const def = byKey.get(key);
        if (!def) continue;
        covered.add(key);
        const chip = chipFromDef(def);
        blockItems.push(chip);
        items.push(chip);
      }
      if (blockItems.length) {
        pages.push({
          page: block.page,
          pageZh: block.pageZh,
          pageEn: block.pageEn,
          items: blockItems,
        });
      }
    }
    if (items.length) {
      groups.push({
        category: section.category,
        labelZh: labels.labelZh,
        labelEn: labels.labelEn,
        items,
        pages,
      });
    }
  }

  const orphans = PERMISSION_CATALOG.filter((d) => !covered.has(d.key)).map(chipFromDef);
  if (orphans.length) {
    groups.push({
      category: 'admin',
      labelZh: '其他',
      labelEn: 'Other',
      items: orphans,
      pages: [{ page: null, pageZh: '', pageEn: '', items: orphans }],
    });
  }
  return groups;
}
