export { APP_VERSION } from './version';
export const APP_NAME = '猛犸专家';

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
  create_agent: '创建专家',
  update_agent: '更新专家',
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
  admin_create_official_agent: '创建官方专家',
  admin_import_official_agent_asset: '导入官方专家资产',
  admin_update_official_agent_draft: '更新官方专家草稿',
  admin_publish_official_agent: '发布官方专家',
  admin_offline_official_agent: '下架官方专家',
  admin_bulk_offline_official_agent: '批量下架官方专家',
  admin_grant_official_agent: '开通官方专家',
  admin_bulk_grant_official_agent: '批量开通官方专家',
  admin_revoke_official_agent: '撤销官方专家授权',
  admin_bulk_revoke_official_agent: '批量撤销官方专家授权',
  admin_create_official_skill: '创建官方技能',
  admin_update_official_skill: '更新官方技能',
  admin_replace_official_skill_package: '替换官方技能包',
  admin_enable_official_skill: '启用官方技能',
  admin_disable_official_skill: '停用官方技能',
  admin_delete_official_skill: '删除官方技能',
  library_upload: '上传资料',
  library_replace: '替换资料版本',
  library_folder: '新建资料文件夹',
  library_link: '新建资料链接',
  library_rename: '重命名资料',
  library_move: '移动资料',
  library_share: '变更资料可见性',
  library_recycle: '回收资料',
  library_restore: '恢复资料',
  library_purge: '彻底删除资料',
  library_retry_parse: '重试资料解析',
  library_ask: '资料问答',
  library_custody_grant: '授予资料代管',
  library_custody_read: '代管读取资料',
  library_custody_revoke: '撤销资料代管',
};

/** 资料库解析状态。Console、Admin、Web 共用这一套文案。 */
export const LibraryParseStatusLabel = {
  PENDING: '待处理',
  PROCESSING: '处理中',
  READY: '可用于 AI',
  FAILED: '失败',
  DOWNLOAD_ONLY: '仅下载',
  NOT_APPLICABLE: '无需解析',
} as const;

export type LibraryParseStatus = keyof typeof LibraryParseStatusLabel;

export type LibraryPickItem = {
  id: string;
  kind: 'FILE' | 'FOLDER' | 'LINK';
  name: string;
  versionId: string | null;
  versionNo: number | null;
  parseStatus: LibraryParseStatus | null;
  parseReason: string | null;
};

export type LibraryChip = {
  nodeId: string;
  versionId: string;
  versionNo: number;
  name: string;
};

export type LocalDraftFile = {
  localId: string;
  name: string;
  persisted: false;
};

/** 本地临时文件只留在会话草稿，不入库。 */
export function stageLocalFiles(names: string[]): LocalDraftFile[] {
  return names.map((name, index) => ({
    localId: `local-${index + 1}`,
    name,
    persisted: false,
  }));
}

/** 明确保存时才入库，并且默认私人、不带共享确认。 */
export function markSavedToLibrary(draft: LocalDraftFile): {
  persist: true;
  name: string;
  scope: 'PRIVATE';
  confirmShare: false;
} {
  return { persist: true, name: draft.name, scope: 'PRIVATE', confirmShare: false };
}

/** 弹窗确认只把资料挂到输入框，不发送。 */
export function confirmLibrarySelection(current: LibraryChip[], picked: LibraryChip[]): {
  chips: LibraryChip[];
  sent: false;
} {
  const seen = new Set(current.map((chip) => chip.versionId));
  const chips = [...current];
  for (const chip of picked) {
    if (seen.has(chip.versionId)) continue;
    seen.add(chip.versionId);
    chips.push(chip);
  }
  return { chips, sent: false };
}

/** 未就绪但看得到的条目展示原因，并且不能选。文件夹和链接不能当问答正文。 */
export function libraryPickBlock(item: LibraryPickItem): { disabled: boolean; reason: string | null } {
  if (item.kind === 'FOLDER') return { disabled: true, reason: '文件夹不能直接问答' };
  if (item.kind === 'LINK') return { disabled: true, reason: '链接只保存网址，不能用于问答' };
  if (!item.versionId || !item.parseStatus) return { disabled: true, reason: '没有可引用的版本' };
  if (item.parseStatus !== 'READY') {
    return {
      disabled: true,
      reason: item.parseReason || LibraryParseStatusLabel[item.parseStatus],
    };
  }
  return { disabled: false, reason: null };
}

/** 列表请求失败时保留已经显示的资料和输入。 */
export function retainRowsOnListError<T>(current: T[]): T[] {
  return current;
}

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

/** 是否有企业工作区（可切到专家），不要求控制台权限包。 */
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
