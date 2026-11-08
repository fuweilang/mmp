/** 资料库领域类型。租户和所有者来自服务端，不来自客户端自报。 */

export type LibraryScope = 'PRIVATE' | 'ENTERPRISE';
export type LibraryKind = 'FILE' | 'FOLDER' | 'LINK';
export type LibraryState = 'ACTIVE' | 'RECYCLED' | 'PURGED';
export type LibraryParseStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'DOWNLOAD_ONLY'
  | 'NOT_APPLICABLE';
export type LocatorKind = 'paragraph' | 'page';
export type CustodyScope = 'ENTERPRISE' | 'PRIVATE_OWNER';
export type CustodyPower = 'READ' | 'CRUD';
export type LibraryView = 'recent' | 'mine' | 'shared' | 'trash' | 'managed';

export type Actor = {
  /** Server-derived single-grant context; never accepted from request bodies. */
  custodyId?: string;
  userId: string;
  /** 登录态里的当前企业。 */
  tenantId: string;
  isPlatformAdmin: boolean;
  isOrgAdmin: boolean;
  /** 仍是该企业成员。离开后为 false，不因此把私人资料改成共享。 */
  activeMember: boolean;
};

export type NodeRecord = {
  id: string;
  tenantId: string;
  ownerUserId: string;
  parentId: string | null;
  kind: LibraryKind;
  name: string;
  scope: LibraryScope;
  state: LibraryState;
  linkUrl: string | null;
  currentVersionId: string | null;
  recycledAt: number | null;
  purgedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type VersionRecord = {
  id: string;
  nodeId: string;
  tenantId: string;
  versionNo: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
  parseStatus: LibraryParseStatus;
  parseReason: string | null;
  extractTruncated: boolean;
  createdByUserId: string;
  createdAt: number;
};

export type ChunkRecord = {
  id: string;
  versionId: string;
  tenantId: string;
  ordinal: number;
  content: string;
  locator: string;
  locatorKind: LocatorKind;
};

export type RecentRecord = {
  id: string;
  tenantId: string;
  userId: string;
  nodeId: string;
  accessedAt: number;
};

export type CustodyRecord = {
  id: string;
  tenantId: string;
  grantorUserId: string;
  granteeUserId: string;
  contentScope: CustodyScope;
  ownerUserId: string | null;
  powers: CustodyPower;
  expiresAt: number;
  revokedAt: number | null;
  reason: string;
  createdAt: number;
};

export type AuditRecord = {
  id: string;
  tenantId: string | null;
  userId: string | null;
  action: string;
  meta: Record<string, string | number | boolean | null>;
  createdAt: number;
};

export type VersionBrief = {
  id: string;
  versionNo: number;
  sizeBytes: number;
  parseStatus: LibraryParseStatus;
  parseReason: string | null;
  extractTruncated: boolean;
  originalName: string;
  createdAt: string;
};

export type LibraryItem = {
  id: string;
  kind: LibraryKind;
  name: string;
  scope: LibraryScope;
  state: LibraryState;
  ownerUserId: string;
  ownerName: string | null;
  parentId: string | null;
  parentName: string | null;
  parentHidden: boolean;
  linkUrl: string | null;
  mine: boolean;
  canManage: boolean;
  currentVersion: VersionBrief | null;
  createdAt: string;
  updatedAt: string;
  recycledAt: string | null;
  accessedAt: string | null;
};

export type ParseChunk = {
  ordinal: number;
  content: string;
  locator: string;
  locatorKind: LocatorKind;
};

export type ParseResult = {
  status: LibraryParseStatus;
  reason: string | null;
  truncated: boolean;
  chunks: ParseChunk[];
};
