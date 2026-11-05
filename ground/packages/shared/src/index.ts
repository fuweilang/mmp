export { APP_VERSION } from './version';
export const APP_NAME = '猛犸智能体';

export const TenantType = {
  PLATFORM: 'PLATFORM',
  AGENCY: 'AGENCY',
  ENTERPRISE: 'ENTERPRISE',
} as const;
export type TenantType = (typeof TenantType)[keyof typeof TenantType];

export const MemberRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;
export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];

export const TenantTypeLabel: Record<TenantType, string> = {
  PLATFORM: '总部',
  AGENCY: '代理商',
  ENTERPRISE: '企业',
};

export const MemberRoleLabel: Record<MemberRole, string> = {
  OWNER: '负责人',
  ADMIN: '管理员',
  MEMBER: '成员',
};

export const AccessScope = {
  ALL: 'ALL',
  SELECTED: 'SELECTED',
} as const;
export type AccessScope = (typeof AccessScope)[keyof typeof AccessScope];

export const AccessScopeLabel: Record<AccessScope, string> = {
  ALL: '全员',
  SELECTED: '指定成员',
};

export const KbStatus = {
  PENDING: 'PENDING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
export type KbStatus = (typeof KbStatus)[keyof typeof KbStatus];

export const KbStatusLabel: Record<KbStatus, string> = {
  PENDING: '待生效',
  READY: '已生效',
  FAILED: '失败',
};

export const AuditActionLabel: Record<string, string> = {
  login: '登录',
  register: '注册',
  switch_tenant: '切换企业',
  exit_workbench: '退出业务工作台',
  create_tenant: '创建租户',
  add_member: '添加成员',
  remove_member: '移除成员',
  create_agent: '创建智能体',
  update_agent: '更新智能体',
  create_kb_folder: '新建知识目录',
  upload_kb: '上传知识文件',
  update_kb: '更新知识文件',
  delete_kb: '删除知识文件',
  update_quota: '更新配额',
  update_enterprise: '更新企业设置',
  update_enterprise_logo: '更新企业 Logo',
  create_tenant_role: '新建企业角色',
  update_tenant_role: '更新企业角色',
  delete_tenant_role: '删除企业角色',
  update_member: '更新成员',
  change_own_password: '修改自己的密码',
  update_own_profile: '修改个人资料',
  member_change_password: '重置成员密码',
  admin_create_user: '总后台创建用户',
  admin_update_user: '总后台更新用户',
  admin_change_user_password: '总后台改用户密码',
  admin_deactivate_user: '总后台停用用户',
  admin_delete_user: '总后台删除用户',
  admin_create_enterprise: '总后台创建企业',
  admin_update_enterprise: '总后台更新企业',
  admin_delete_enterprise: '总后台删除企业',
  admin_create_role: '总后台创建角色',
  admin_update_role: '总后台更新角色',
  admin_delete_role: '总后台删除角色',
  admin_create_tenant_role: '总后台创建企业角色',
  admin_update_tenant_role: '总后台更新企业角色',
  admin_delete_tenant_role: '总后台删除企业角色',
  billing_manual_adjust: '钱包调账',
  billing_update_config: '更新计价配置',
  upsert_org_member_preset_override: '覆盖企业成员预设权限',
};

export function hasPermission(
  session: SessionMe | null | undefined,
  key: string,
): boolean {
  if (!session) return false;
  const perms = session.effectivePermissions;
  if (Array.isArray(perms)) return perms.includes(key);
  return false;
}

/**
 * 企业控制台访问权：需要 portal.console.access；平台管理员代运营时另需选中企业。
 * 无该权限时 agent/客户端侧应隐藏「企业控制台」入口（勿留可点的 403 按钮）。
 */
export function canAccessConsole(session: SessionMe | null | undefined): boolean {
  if (!session) return false;
  if (session.user.isPlatformAdmin) {
    return Boolean(session.currentTenant);
  }
  if (!session.currentTenant) return false;
  return hasPermission(session, 'portal.console.access');
}

/** 是否有企业工作区（可切到智能体），不要求控制台权限包。 */
export function hasEnterpriseWorkspace(
  session: SessionMe | null | undefined,
): boolean {
  if (!session) return false;
  return Boolean(session.currentTenant);
}

/** Prefer portal.admin.access; fall back to isPlatformAdmin. */
export function canAccessAdmin(session: SessionMe | null | undefined): boolean {
  if (!session) return false;
  const perms = session.effectivePermissions;
  if (Array.isArray(perms) && perms.includes('portal.admin.access')) return true;
  return Boolean(session.user.isPlatformAdmin);
}

/** 企业写操作（成员/角色增删改）：企业管理员或平台管理员。 */
export function isOrgAdmin(session: SessionMe | null | undefined): boolean {
  if (!session) return false;
  if (session.user.isPlatformAdmin) return true;
  const role = session.currentRole;
  return role === MemberRole.ADMIN || role === MemberRole.OWNER;
}

export type PublicUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isPlatformAdmin: boolean;
  platformRoleKey?: string | null;
  /** 当前用户绑定的全部角色名（个人账号弹窗展示用）。 */
  roleNames?: string[];
};

export type PublicTenant = {
  id: string;
  name: string;
  slug: string;
  type: TenantType;
  status: string;
};

export type SessionMe = {
  user: PublicUser;
  currentTenant: PublicTenant | null;
  currentRole: MemberRole | null;
  tenants: Array<PublicTenant & { role: MemberRole | null }>;
  /** Sorted unique permission keys (platform ∪ org preset). */
  effectivePermissions: string[];
  platformRoleKey: string | null;
};
