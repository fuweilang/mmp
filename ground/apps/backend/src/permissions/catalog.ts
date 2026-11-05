/**
 * Permission catalog (ground) — portal.* + harness 业务键。
 * Source of truth for chip UI / RolePermission validation。
 * 旧 Octop 安装级 / 垃圾 key（experts/mbti/memory/channels/.../users/sso/...）已移出 Catalog；
 * 角色库里残留的未知键在读出时由 sanitizePermissionKeys / isKnownPermissionKey 丢弃，不做 DB 迁移。
 */

export type PermissionCategory =
  | 'nav'
  | 'settings'
  | 'control'
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

/**
 * Harness / 业务模块键（对齐 mammoth-agent 可分配能力）。
 * 已剔除：experts/mbti/memory/channels/connectors/skill_packages/knowledge_bases
 * 以及 Octop 安装级 admin（users/sso/ollama_models/...）与 remote desktop/mobile。
 * 知识库只走 portal.console.kb，不再推 Octop knowledge_* 给企业分配。
 */
export const OCTOP_PERMISSIONS: PermissionDef[] = [
  p('tasks', 'nav', '定时任务', 'Scheduled Tasks'),
  p('token_usage', 'nav', 'Token 统计', 'Token usage'),

  p('skills', 'settings', '技能', 'Skills', {
    page: 'personalization',
    pageZh: '个性化',
    pageEn: 'Personalization',
  }),
  p('subagents', 'settings', '子智能体', 'Subagents', {
    page: 'personalization',
    pageZh: '个性化',
    pageEn: 'Personalization',
  }),
  p('tools', 'settings', '工具', 'Tools', {
    page: 'personalization',
    pageZh: '个性化',
    pageEn: 'Personalization',
  }),
  p('agent_plugins', 'settings', '插件', 'Plugins', {
    page: 'personalization',
    pageZh: '个性化',
    pageEn: 'Personalization',
  }),

  p('terminal', 'control', '工作台/终端', 'Workbench / Terminal', {
    page: 'workbench',
    pageZh: '工作台',
    pageEn: 'Workbench',
  }),
  p('browser', 'control', '工作台/浏览器', 'Workbench / Browser', {
    page: 'workbench',
    pageZh: '工作台',
    pageEn: 'Workbench',
  }),
];

/** Portal keys（ground /admin + /console）。 */
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

export const PERMISSION_CATALOG: PermissionDef[] = [
  ...OCTOP_PERMISSIONS,
  ...PORTAL_PERMISSIONS,
];

export const ALL_PERMISSION_KEYS: ReadonlySet<string> = new Set(
  PERMISSION_CATALOG.map((d) => d.key),
);

/** BASELINE = settings + nav（chat ungated，不是 key） */
export const BASELINE_PERMISSION_KEYS: string[] = OCTOP_PERMISSIONS.filter(
  (d) => d.category === 'settings' || d.category === 'nav',
).map((d) => d.key);

const byCat = (cat: PermissionCategory) =>
  OCTOP_PERMISSIONS.filter((d) => d.category === cat).map((d) => d.key);

/** 企业可分配的 harness 业务键（nav + 个性化设置） */
export const BUSINESS_MODULE_KEYS: string[] = [
  ...byCat('nav'),
  'skills',
  'subagents',
  'tools',
  'agent_plugins',
];

/** OWNER / org_admin：nav+settings+control（无安装级 admin） */
export const OWNER_OCTOP_KEYS: string[] = [
  ...byCat('nav'),
  ...byCat('settings'),
  ...byCat('control'),
];

export const PORTAL_ADMIN_KEYS = PORTAL_PERMISSIONS.filter((d) =>
  d.key.startsWith('portal.admin.'),
).map((d) => d.key);

export const PORTAL_CONSOLE_KEYS = PORTAL_PERMISSIONS.filter((d) =>
  d.key.startsWith('portal.console.'),
).map((d) => d.key);

/** 企业角色可勾选硬顶：console 模块包 + harness 业务/控制包；不含总后台与安装级 admin。 */
export const ASSIGNABLE_TENANT_KEYS: ReadonlySet<string> = new Set([
  ...PORTAL_CONSOLE_KEYS,
  ...BUSINESS_MODULE_KEYS,
  ...byCat('control'),
]);

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
 * 三档默认包（任务2）：
 * - org_member：业务 skills/subagents/tools/agent_plugins/tasks；无 console/billing/terminal/browser；对话 ungated
 * - org_admin：成员业务包 + terminal/browser + 全部 portal.console.*（含 billing）
 * - platform_admin：全部 portal.admin.* + 业务模块；超管代运营另有全部 portal.console.*（super_admin=全量）
 */
/** 企业成员默认业务键（不含 token_usage / control / portal）。 */
export const ORG_MEMBER_DEFAULT_KEYS: string[] = [
  'skills',
  'subagents',
  'tools',
  'agent_plugins',
  'tasks',
];

export const ROLE_PERMISSION_PACKS: Record<BuiltinRoleKey, string[]> = {
  super_admin: uniqSorted([...ALL_PERMISSION_KEYS]),
  platform_admin: uniqSorted([
    ...PORTAL_ADMIN_KEYS,
    ...BUSINESS_MODULE_KEYS,
  ]),
  org_admin: uniqSorted([
    ...ORG_MEMBER_DEFAULT_KEYS,
    'terminal',
    'browser',
    ...PORTAL_CONSOLE_KEYS,
  ]),
  org_member: uniqSorted([...ORG_MEMBER_DEFAULT_KEYS]),
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
    description: '平台运营：可管理企业、用户与角色权限包，也能使用业务功能；不能进入企业后台。',
    scope: 'PLATFORM',
    editable: true,
  },
  org_admin: {
    name: '企业管理员',
    description: '企业管理员：成员业务包 + 终端/浏览器 + 全部企业控制台模块（含充值）。',
    scope: 'ORG_PRESET',
    editable: true,
  },
  org_member: {
    name: '企业成员',
    description: '普通员工：默认可用技能/子智能体/工具/插件与定时任务；对话不门禁；默认不进控制台、无充值/终端/浏览器。',
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
  nav: { labelZh: '导航', labelEn: 'Nav' },
  settings: { labelZh: '设置', labelEn: 'Settings' },
  control: { labelZh: '控制', labelEn: 'Control' },
  admin: { labelZh: 'Agent 管理', labelEn: 'Agent admin' },
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
 * Chip picker 布局：category → optional page → chips。
 * 按钮式权限包 UI 不变；已去掉 Octop 垃圾/安装级分组。
 */
const PICKER_LAYOUT: readonly {
  category: PermissionCategory;
  pages: readonly { page: string | null; pageZh: string; pageEn: string; keys: readonly string[] }[];
}[] = [
  {
    category: 'nav',
    pages: [{ page: null, pageZh: '', pageEn: '', keys: ['tasks', 'token_usage'] }],
  },
  {
    category: 'settings',
    pages: [
      {
        page: 'personalization',
        pageZh: '个性化',
        pageEn: 'Personalization',
        keys: ['skills', 'subagents', 'tools', 'agent_plugins'],
      },
    ],
  },
  {
    category: 'control',
    pages: [
      {
        page: 'workbench',
        pageZh: '工作台',
        pageEn: 'Workbench',
        keys: ['terminal', 'browser'],
      },
    ],
  },
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
