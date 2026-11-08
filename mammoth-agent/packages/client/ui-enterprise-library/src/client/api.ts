import type { LibraryChoice, LibraryKind } from './selection.ts'

export type LibraryView = 'recent' | 'mine' | 'shared' | 'trash'

type RawVersion = {
  id?: string
  versionNo?: number
  parseStatus?: string
  sizeBytes?: number
  parseReason?: string | null
}

type RawItem = {
  id?: string
  name?: string
  kind?: LibraryKind
  canManage?: boolean
  scope?: string
  parentId?: string | null
  updatedAt?: string
  accessedAt?: string
  linkUrl?: string | null
  currentVersion?: RawVersion | null
}

/** Same-origin or configured ground origin. The query never carries a tenant id. */
export function libraryItemsUrl(origin: string, view: LibraryView, q = '', parentId?: string | null, flat = false): string {
  const base = origin.replace(/\/$/, '')
  const params = new URLSearchParams({ view })
  if (flat) params.set('flat', '1')
  if (parentId && !q.trim()) params.set('parentId', parentId)
  const query = q.trim()
  if (query) params.set('q', query)
  return `${base}/ground-library/items?${params.toString()}`
}

export function libraryOpenUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/ground-library/open`
}

export function readLibraryItems(payload: unknown): LibraryChoice[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { items?: unknown }).items)) return []
  return (payload as { items: RawItem[] }).items.flatMap((item) => {
    if (!item.id || !item.name || (item.kind !== 'FILE' && item.kind !== 'FOLDER' && item.kind !== 'LINK')) return []
    return [{
      nodeId: item.id,
      ...(typeof item.accessedAt === 'string' ? { accessedAt: item.accessedAt } : {}),
      ...(typeof item.updatedAt === 'string' ? { updatedAt: item.updatedAt } : {}),
      ...(typeof item.currentVersion?.sizeBytes === 'number' && Number.isFinite(item.currentVersion.sizeBytes) && item.currentVersion.sizeBytes >= 0 ? { sizeBytes: item.currentVersion.sizeBytes } : {}),
      name: item.name,
      canManage: item.canManage === true,
      scope: item.scope ?? 'PRIVATE',
      parentId: item.parentId ?? null,
      url: item.linkUrl ?? null,
      kind: item.kind,
      versionId: item.currentVersion?.id ?? null,
      versionNo: item.currentVersion?.versionNo ?? null,
      parseStatus: item.currentVersion?.parseStatus ?? null,
      parseReason: item.currentVersion?.parseReason ?? null,
    }]
  })
}

export type LibraryFetch = (url: string, init?: RequestInit) => Promise<Response>

/** Library refusal with the HTTP status that produced it. */
export class LibraryRequestError extends Error {
  /** @param message - readable refusal, including any Ground `message` field. @param status - HTTP status. */
  constructor(message: string, readonly status: number) { super(message) }
}

function messageOf(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object') return undefined
  const raw = (body as { message?: unknown }).message
  if (typeof raw === 'string') return raw.trim() || undefined
  if (!Array.isArray(raw)) return undefined
  const parts = raw.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
  return parts.length > 0 ? parts.join('; ') : undefined
}

/** Keep the Ground refusal text; 401/403 also state the re-authentication requirement. */
async function failure(response: Response, label: string): Promise<LibraryRequestError> {
  let detail: string | undefined
  try { detail = messageOf(await response.json()) } catch { /* refusal bodies may be empty or binary */ }
  const fallback = response.status === 401 ? 'sign in again'
    : response.status === 403 ? 'connection is not authorized; sign in again'
      : `HTTP ${response.status}`
  return new LibraryRequestError(`${label} ${response.status}: ${detail === undefined ? fallback : `${fallback} (${detail})`}`, response.status)
}

/** List one view. Credentials stay on the request; tenant id is not sent. */
export async function fetchLibraryItems(origin: string, view: LibraryView, q: string, fetchImpl: LibraryFetch, signal?: AbortSignal, parentId?: string | null, flat = false): Promise<LibraryChoice[]> {
  const init: RequestInit = { credentials: 'include' }
  if (signal) init.signal = signal
  const response = await fetchImpl(libraryItemsUrl(origin, view, q, parentId, flat), init)
  if (!response.ok) throw await failure(response, 'library list')
  return readLibraryItems(await response.json())
}

export type OpenedSource = {
  readonly name: string
  readonly versionId: string
  readonly locator: string | null
  readonly quote: string | null
  /** Ground reported that the stored excerpt omits part of the version. */
  readonly truncated: boolean
  /** Ground explanation for a truncated excerpt; null when complete or absent. */
  readonly truncationNote: string | null
}

/** Re-check one version. The body is whatever the server still allows. */
export async function fetchLibrarySource(
  origin: string,
  nodeId: string,
  versionId: string,
  fetchImpl: LibraryFetch,
  signal?: AbortSignal,
  purpose: 'preview' | 'prepare' = 'preview',
): Promise<OpenedSource> {
  const init: RequestInit = {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId, versionId, ...(purpose === 'prepare' ? { purpose } : {}) }),
  }
  if (signal) init.signal = signal
  const response = await fetchImpl(libraryOpenUrl(origin), init)
  if (!response.ok) throw await failure(response, 'library open')
  const body = await response.json() as {
    name?: unknown
    versionId?: unknown
    locator?: unknown
    quote?: unknown
    truncated?: unknown
    truncationNote?: unknown
  }
  if (typeof body.name !== 'string' || typeof body.versionId !== 'string' || body.versionId !== versionId) {
    throw new Error('library open returned a different version')
  }
  const truncated = body.truncated === true
  return {
    name: body.name,
    versionId: body.versionId,
    locator: typeof body.locator === 'string' ? body.locator : null,
    quote: typeof body.quote === 'string' ? body.quote : null,
    truncated,
    truncationNote: truncated && typeof body.truncationNote === 'string' && body.truncationNote.trim() !== ''
      ? body.truncationNote
      : null,
  }
}

/** Mutate only through the protected Host. All authorization stays on Ground. */
export async function libraryRequest(origin: string, path: string, method: string, data: unknown, fetchImpl: LibraryFetch): Promise<unknown> {
  const form = data instanceof FormData
  const response = await fetchImpl(`${origin.replace(/\/$/, '')}/ground-library/${path}`, {
    method, credentials: 'include',
    ...(data === undefined ? {} : form ? { body: data } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
  })
  const payload: unknown = await response.json()
  if (!response.ok) throw new Error(payload && typeof payload === 'object' && 'message' in payload ? String(payload.message) : `HTTP ${response.status}`)
  return payload
}

export type LibraryPage = { items: LibraryChoice[]; total: number; breadcrumb: { id: string; name: string }[] };
/** A single authorized page; paging is explicit so old flat pickers keep all their candidates. */
export async function fetchLibraryPage(origin: string, view: LibraryView, q: string, fetchImpl: LibraryFetch, signal?: AbortSignal, parentId?: string | null, page = 1, status = 'all'): Promise<LibraryPage> {
  const url = libraryItemsUrl(origin, view, q, parentId) + `&page=${page}&pageSize=20&status=${encodeURIComponent(status)}`;
  const response = await fetchImpl(url, { credentials: 'include', ...(signal ? { signal } : {}) });
  if (!response.ok) throw await failure(response, 'library list');
  const payload: unknown = await response.json();
  const items = readLibraryItems(payload);
  const raw = payload as { total?: unknown; breadcrumb?: { id: string; name: string }[] };
  return { items, total: typeof raw.total === 'number' ? raw.total : items.length, breadcrumb: Array.isArray(raw.breadcrumb) ? raw.breadcrumb : [] };
}
/** Fetch protected media bytes through the same account-bound Host; never mint a public URL. */
export async function fetchLibraryMedia(origin: string, nodeId: string, versionId: string, fetchImpl: LibraryFetch, signal?: AbortSignal): Promise<Blob> {
  const response = await fetchImpl(`${origin}/ground-library/nodes/${encodeURIComponent(nodeId)}/download?versionId=${encodeURIComponent(versionId)}&inline=1`, { credentials: 'include', ...(signal ? { signal } : {}) });
  if (!response.ok) throw await failure(response, 'library media');
  if (!/^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|quicktime))$/.test(response.headers.get('content-type') ?? '')) throw new Error('unsupported media response');
  return response.blob();
}
