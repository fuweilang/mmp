import { ApiError, apiUrl, http } from './http';
import type { LibraryParseStatus } from '@mammoth/shared';

export type LibraryVersion = {
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
  kind: 'FILE' | 'FOLDER' | 'LINK';
  name: string;
  scope: 'PRIVATE' | 'ENTERPRISE';
  state: 'ACTIVE' | 'RECYCLED' | 'PURGED';
  ownerName: string | null;
  parentId: string | null;
  parentName: string | null;
  parentHidden: boolean;
  linkUrl: string | null;
  mine: boolean;
  canManage: boolean;
  currentVersion: LibraryVersion | null;
  updatedAt: string;
  accessedAt: string | null;
};

export type LibraryList = {
  items: LibraryItem[];
  breadcrumb: { id: string; name: string }[];
};

export type LibraryView = 'recent' | 'mine' | 'shared' | 'trash';

export type LibraryPreview = {
  nodeId: string;
  versionId: string | null;
  versionNo: number | null;
  name: string;
  previewKind: 'text' | 'download_only' | 'link' | 'blocked';
  text: string | null;
  linkUrl: string | null;
  parseStatus: LibraryParseStatus;
  parseReason: string | null;
  executable: false;
  preciseHighlight: boolean;
  highlightNote: string | null;
};

export type LibraryCitation = {
  marker: string;
  nodeId: string;
  versionId: string;
  versionNo: number;
  name: string;
  locator: string;
  locatorKind: 'paragraph' | 'page';
  quote: string;
};

export type LibraryAnswer = {
  status: 'answered' | 'model_unconfigured' | 'no_evidence';
  modelRef: string | null;
  modelVerified: boolean;
  answer: string | null;
  truncated: boolean;
  truncationNote: string | null;
  citations: LibraryCitation[];
  notices: string[];
};

export function listLibrary(view: LibraryView, parentId: string | null, q: string) {
  const params = new URLSearchParams({ view });
  if (parentId) params.set('parentId', parentId);
  if (q.trim()) params.set('q', q.trim());
  return http<LibraryList>(`/api/library/items?${params.toString()}`);
}

export function createLibraryFolder(name: string, parentId: string | null) {
  return http<LibraryItem>('/api/library/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentId: parentId ?? undefined }),
  });
}

export function createLibraryLink(name: string, url: string, parentId: string | null) {
  return http<LibraryItem>('/api/library/links', {
    method: 'POST',
    body: JSON.stringify({ name, url, parentId: parentId ?? undefined }),
  });
}

export function renameLibrary(id: string, name: string) {
  return http<LibraryItem>(`/api/library/nodes/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}

export function moveLibrary(id: string, parentId: string | null) {
  return http<LibraryItem>(`/api/library/nodes/${id}/move`, {
    method: 'POST',
    body: JSON.stringify({ parentId }),
  });
}

export function shareLibrary(id: string, scope: 'PRIVATE' | 'ENTERPRISE', confirmShare: boolean) {
  return http<LibraryItem>(`/api/library/nodes/${id}/scope`, {
    method: 'POST',
    body: JSON.stringify({ scope, confirmShare }),
  });
}

export function recycleLibrary(id: string) {
  return http<{ ok: boolean }>(`/api/library/nodes/${id}/recycle`, { method: 'POST' });
}

export function restoreLibrary(id: string) {
  return http<LibraryItem>(`/api/library/nodes/${id}/restore`, { method: 'POST' });
}

export function purgeLibrary(id: string) {
  return http<{ ok: boolean }>(`/api/library/nodes/${id}`, { method: 'DELETE' });
}

export function retryLibraryParse(id: string) {
  return http<LibraryItem>(`/api/library/nodes/${id}/retry-parse`, { method: 'POST' });
}

export function previewLibrary(id: string, versionId?: string | null) {
  const params = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
  return http<LibraryPreview>(`/api/library/nodes/${id}/preview${params}`);
}

export function libraryDownloadUrl(id: string, versionId?: string | null) {
  const params = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
  return apiUrl(`/api/library/nodes/${id}/download${params}`);
}

export type LibrarySource = {
  nodeId: string;
  versionId: string;
  versionNo: number;
  name: string;
  locator: string | null;
  locatorKind: 'paragraph' | 'page' | null;
  quote: string | null;
  preciseHighlight: boolean;
  highlightNote: string | null;
  replacementVersionId: null;
};

export function openLibraryCitation(nodeId: string, versionId: string, locator?: string | null) {
  return http<LibrarySource>('/api/library/open', {
    method: 'POST',
    body: JSON.stringify({ nodeId, versionId, locator: locator ?? undefined }),
  });
}

export function askLibrary(versionIds: string[], question: string) {
  return http<LibraryAnswer>('/api/library/ask', {
    method: 'POST',
    body: JSON.stringify({ versionIds, question }),
  });
}

export function batchLibrary(ids: string[], action: 'recycle' | 'restore' | 'purge') {
  return http<{ ok: string[]; failed: { id: string; message: string }[]; skipped: number }>('/api/library/batch', {
    method: 'POST',
    body: JSON.stringify({ ids, action }),
  });
}

export function libraryFolders() {
  return listLibrary('mine', null, '').then(async (mine) => {
    const shared = await listLibrary('shared', null, '');
    return [...mine.items, ...shared.items].filter((item) => item.kind === 'FOLDER');
  });
}

export type UploadOutcome = {
  items: LibraryItem[];
  failed: { name: string; message: string }[];
};

/** 传输进度只反映字节上传，解析状态在返回的资料上。 */
export function uploadLibraryFiles(
  files: File[],
  parentId: string | null,
  onProgress: (ratio: number) => void,
): Promise<UploadOutcome> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    for (const file of files) body.append('files', file);
    if (parentId) body.append('parentId', parentId);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl('/api/library/files'));
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiError(0, '上传中断，可以重试'));
    xhr.onload = () => {
      let data: UploadOutcome | { message?: string } | null = null;
      try {
        data = JSON.parse(xhr.responseText) as UploadOutcome;
      } catch {
        reject(new ApiError(xhr.status || 502, '上传结果无法解析'));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const message = data && 'message' in data && typeof data.message === 'string' ? data.message : '上传失败';
        reject(new ApiError(xhr.status, message));
        return;
      }
      resolve(data as UploadOutcome);
    };
    xhr.send(body);
  });
}

export function replaceLibraryFile(id: string, file: File) {
  const body = new FormData();
  body.append('files', file);
  return fetch(apiUrl(`/api/library/files/${id}/versions`), { method: 'POST', body, credentials: 'include' }).then(async (res) => {
    const data = await res.json() as LibraryItem & { message?: string };
    if (!res.ok) throw new ApiError(res.status, data.message || '替换失败');
    return data;
  });
}

export type LibraryStats = {
  limits: {
    maxFileBytes: number;
    tenantQuotaBytes: number;
    recycleDays: number;
    askMaxChars: number;
    allowedExtensions: string[];
  };
  tenants: {
    tenantId: string;
    tenantName: string;
    activeFiles: number;
    recycledFiles: number;
    purgedFiles: number;
    versionCount: number;
    usedBytes: number;
    ready: number;
    failed: number;
    downloadOnly: number;
    pending: number;
    processing: number;
  }[];
};

export function libraryAdminStats() {
  return http<LibraryStats>('/api/library/admin/stats');
}

export type CustodyRow = {
  id: string;
  tenantId: string;
  granteeUserId: string;
  contentScope: 'ENTERPRISE' | 'PRIVATE_OWNER';
  ownerUserId: string | null;
  powers: 'READ' | 'CRUD';
  expiresAt: string;
  revokedAt: string | null;
  reason: string;
  message?: string;
};

export function libraryCustodies() {
  return http<CustodyRow[]>('/api/library/admin/custody');
}

export function grantLibraryCustody(body: {
  tenantId: string;
  granteeUserId: string;
  contentScope: 'ENTERPRISE' | 'PRIVATE_OWNER';
  ownerUserId?: string;
  powers: 'READ' | 'CRUD';
  expiresAt: string;
  reason: string;
}) {
  return http<CustodyRow>('/api/library/admin/custody', { method: 'POST', body: JSON.stringify(body) });
}

export function revokeLibraryCustody(id: string) {
  return http<CustodyRow>(`/api/library/admin/custody/${id}/revoke`, { method: 'POST' });
}

export type CustodyOptions = { tenantId: string; ownerUserId: string; canApproveEnterprise: boolean; grantees: { id: string; name: string }[] };
export const libraryCustodyOptions = () => http<CustodyOptions>('/api/library/custody/options');
export const libraryManagedItems = (id: string, parentId: string | null, q: string) => {
  const params = new URLSearchParams({ q }); if (parentId) params.set('parentId', parentId);
  return http<LibraryList>(`/api/library/admin/custody/${encodeURIComponent(id)}/items?${params}`);
};
export const libraryManagedPreview = (id: string, nodeId: string, versionId: string) => http<LibraryPreview>(`/api/library/admin/custody/${encodeURIComponent(id)}/nodes/${encodeURIComponent(nodeId)}/preview?versionId=${encodeURIComponent(versionId)}`);
export const libraryManagedDownload = (id: string, nodeId: string, versionId: string) => apiUrl(`/api/library/admin/custody/${encodeURIComponent(id)}/nodes/${encodeURIComponent(nodeId)}/download?versionId=${encodeURIComponent(versionId)}`);
