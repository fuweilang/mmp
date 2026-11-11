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
  purgeBlockedReason?: string | null
  scope?: string
  parentId?: string | null
  parentPath?: { id?: string; name?: string }[]
  location?: string
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
    if (item.kind === 'FILE' && item.currentVersion?.parseStatus === 'FAILED') return []
    return [{
      nodeId: item.id,
      ...(typeof item.accessedAt === 'string' ? { accessedAt: item.accessedAt } : {}),
      ...(typeof item.updatedAt === 'string' ? { updatedAt: item.updatedAt } : {}),
      ...(typeof item.currentVersion?.sizeBytes === 'number' && Number.isFinite(item.currentVersion.sizeBytes) && item.currentVersion.sizeBytes >= 0 ? { sizeBytes: item.currentVersion.sizeBytes } : {}),
      name: item.name,
      canManage: item.canManage === true,
      purgeBlockedReason: typeof item.purgeBlockedReason === 'string' ? item.purgeBlockedReason : null,
      scope: item.scope ?? 'PRIVATE',
      parentId: item.parentId ?? null,
      ...(Array.isArray(item.parentPath) ? { parentPath: item.parentPath.flatMap((part) => part.id && part.name ? [{ id: part.id, name: part.name }] : []) } : {}),
      ...(item.location === 'mine' || item.location === 'shared' ? { location: item.location } : {}),
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

/** Library refusal with the HTTP status and optional Ground error code. */
export class LibraryRequestError extends Error {
  /** @param message - readable refusal, including any Ground `message` field. @param status - HTTP status. @param code - stable Ground refusal code, when present. */
  constructor(message: string, readonly status: number, readonly code?: string) { super(message) }
}

function messageOf(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object') return undefined
  const raw = (body as { message?: unknown }).message
  if (typeof raw === 'string') return raw.trim() || undefined
  if (!Array.isArray(raw)) return undefined
  const parts = raw.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
  return parts.length > 0 ? parts.join('; ') : undefined
}

/** Retain the Ground code and refusal text; labelled reads also include transport diagnostics. */
async function failure(response: Response, label?: string): Promise<LibraryRequestError> {
  let detail: string | undefined
  let code: string | undefined
  try {
    const body: unknown = await response.json()
    detail = messageOf(body)
    if (body !== null && typeof body === 'object' && 'code' in body && typeof body.code === 'string') code = body.code
  } catch { /* refusal bodies may be empty or binary */ }
  const fallback = response.status === 401 ? 'sign in again'
    : response.status === 403 ? 'connection is not authorized; sign in again'
      : `HTTP ${response.status}`
  const message = label === undefined ? detail ?? fallback : `${label} ${response.status}: ${detail === undefined ? fallback : `${fallback} (${detail})`}`
  return new LibraryRequestError(message, response.status, code)
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
  readonly nodeId: string
  readonly versionNo: number | null
  readonly highlightNote: string | null
  readonly preciseHighlight: boolean
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
  locator?: string,
): Promise<OpenedSource> {
  const init: RequestInit = {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId, versionId, ...(locator === undefined ? {} : { locator }), ...(purpose === 'prepare' ? { purpose } : {}) }),
  }
  if (signal) init.signal = signal
  const response = await fetchImpl(libraryOpenUrl(origin), init)
  if (!response.ok) throw await failure(response, 'library open')
  const body = await response.json() as {
    nodeId?: unknown
    versionNo?: unknown
    highlightNote?: unknown
    preciseHighlight?: unknown
    name?: unknown
    versionId?: unknown
    locator?: unknown
    quote?: unknown
    truncated?: unknown
    truncationNote?: unknown
  }
  if (typeof body.name !== 'string' || typeof body.versionId !== 'string' || body.versionId !== versionId || (body.nodeId !== undefined && body.nodeId !== nodeId)) {
    throw new Error('library open returned a different version')
  }
  const truncated = body.truncated === true
  return {
    nodeId,
    versionNo: typeof body.versionNo === 'number' && Number.isInteger(body.versionNo) && body.versionNo > 0 ? body.versionNo : null,
    highlightNote: typeof body.highlightNote === 'string' ? body.highlightNote : null,
    preciseHighlight: body.preciseHighlight === true,
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

/** Request only through the protected Host; refusals retain their HTTP status and Ground code. */
export async function libraryRequest(origin: string, path: string, method: string, data: unknown, fetchImpl: LibraryFetch): Promise<unknown> {
  const form = data instanceof FormData
  const response = await fetchImpl(`${origin.replace(/\/$/, '')}/ground-library/${path}`, {
    method, credentials: 'include',
    ...(data === undefined ? {} : form ? { body: data } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
  })
  if (!response.ok) throw await failure(response)
  return response.json()
}

export type LibraryPage = { items: LibraryChoice[]; total: number; breadcrumb: { id: string; name: string }[]; parentScope?: 'PRIVATE' | 'ENTERPRISE' };

/** Every visible file, ten at a time. Folders are not included. */
export async function fetchLibraryCatalog(origin: string, q: string, page: number, fetchImpl: LibraryFetch, signal?: AbortSignal): Promise<{ items: LibraryChoice[]; total: number }> {
  const params = new URLSearchParams({ catalog: '1', page: String(page), pageSize: '10' })
  const query = q.trim()
  if (query) params.set('q', query)
  const response = await fetchImpl(`${origin.replace(/\/$/, '')}/ground-library/items?${params}`, { credentials: 'include', ...(signal ? { signal } : {}) })
  if (!response.ok) throw await failure(response, 'library list')
  const payload: unknown = await response.json()
  const total = payload && typeof payload === 'object' && typeof (payload as { total?: unknown }).total === 'number' ? (payload as { total: number }).total : 0
  return { items: readLibraryItems(payload).filter((item) => item.kind === 'FILE'), total }
}
/** A single authorized page; paging is explicit so old flat pickers keep all their candidates. */
export async function fetchLibraryPage(origin: string, view: LibraryView, q: string, fetchImpl: LibraryFetch, signal?: AbortSignal, parentId?: string | null, page = 1, status = 'all'): Promise<LibraryPage> {
  const requested = status === 'download' ? 'uncitable' : status
  const url = libraryItemsUrl(origin, view, q, parentId) + `&page=${page}&pageSize=20&status=${encodeURIComponent(requested)}&agent=1`;
  const response = await fetchImpl(url, { credentials: 'include', ...(signal ? { signal } : {}) });
  if (!response.ok) throw await failure(response, 'library list');
  const payload: unknown = await response.json();
  const items = readLibraryItems(payload);
  const raw = payload as { total?: unknown; breadcrumb?: { id: string; name: string }[]; parentScope?: unknown };
  return { items, total: typeof raw.total === 'number' ? raw.total : items.length, breadcrumb: Array.isArray(raw.breadcrumb) ? raw.breadcrumb : [], ...(raw.parentScope === 'PRIVATE' || raw.parentScope === 'ENTERPRISE' ? { parentScope: raw.parentScope } : {}) };
}

/** Read the authorized recursive count and revision before changing visibility.
 * @param origin - account transport origin.
 * @param id - node whose whole subtree is affected.
 * @param scope - requested visibility.
 * @param fetchImpl - authenticated account transport.
 * @returns Server-confirmed count and revision; malformed responses cannot authorize a mutation.
 */
export async function fetchLibraryScopeImpact(origin: string, id: string, scope: 'PRIVATE' | 'ENTERPRISE', fetchImpl: LibraryFetch): Promise<{ total: number; changed: number; treeRevision: string }> {
  const result = await libraryRequest(origin, `nodes/${encodeURIComponent(id)}/scope-impact?scope=${scope}`, 'GET', undefined, fetchImpl)
  if (!result || typeof result !== 'object' || !('total' in result) || typeof result.total !== 'number' || !Number.isSafeInteger(result.total) || result.total < 1
    || !('changed' in result) || typeof result.changed !== 'number' || !Number.isSafeInteger(result.changed) || result.changed < 0 || result.changed > result.total
    || !('treeRevision' in result) || typeof result.treeRevision !== 'string' || !/^[a-f0-9]{64}$/.test(result.treeRevision)) throw new Error('Invalid library scope impact response')
  return { total: result.total, changed: result.changed, treeRevision: result.treeRevision }
}
/** Fetch protected media bytes through the same account-bound Host; never mint a public URL. */
export async function fetchLibraryMedia(origin: string, nodeId: string, versionId: string, fetchImpl: LibraryFetch, signal?: AbortSignal): Promise<Blob> {
  const response = await fetchImpl(`${origin}/ground-library/nodes/${encodeURIComponent(nodeId)}/download?versionId=${encodeURIComponent(versionId)}&inline=1`, { credentials: 'include', ...(signal ? { signal } : {}) });
  if (!response.ok) throw await failure(response, 'library media');
  if (!/^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|quicktime))$/.test(response.headers.get('content-type') ?? '')) throw new Error('unsupported media response');
  return response.blob();
}

/**
 * Read complete bytes of one authorized immutable library version for format-aware preview.
 * @param origin - account Host origin.
 * @param nodeId - selected file node.
 * @param versionId - exact selected version; current-version fallback is forbidden.
 * @param name - immutable original name of the selected version, used only to choose Office conversion.
 * @param fetchImpl - authenticated same-origin transport.
 * @param signal - selection lifetime; cancellation discards even a completed buffered response.
 * @returns owned complete bytes, response MIME type, and conversion font diagnostics.
 */
export async function fetchLibraryPreviewBytes(
  origin: string, nodeId: string, versionId: string, name: string, fetchImpl: LibraryFetch, signal?: AbortSignal,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string; missingFonts: readonly string[] }> {
  signal?.throwIfAborted()
  if (!versionId) throw new Error('library preview requires an exact version')
  const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? ''
  const office = /^(doc|docx|ppt|pptx)$/.test(extension)
  const query = new URLSearchParams({ versionId })
  if (office) query.set('extension', extension)
  const response = await fetchImpl(`${origin.replace(/\/$/, '')}/ground-library/nodes/${encodeURIComponent(nodeId)}/${office ? 'render' : 'download'}?${query}`, { credentials: 'include', ...(signal ? { signal } : {}) })
  signal?.throwIfAborted()
  if (!response.ok) throw await failure(response, 'library preview')
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream'
  const bytes = new Uint8Array(await response.arrayBuffer())
  signal?.throwIfAborted()
  let missingFonts: readonly string[] = []
  if (office) {
    if (mimeType !== 'application/pdf' || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('Office preview did not return a PDF')
    const fonts: unknown = JSON.parse(decodeURIComponent(response.headers.get('x-mmp-missing-fonts') ?? '[]'))
    if (!Array.isArray(fonts) || !fonts.every((font): font is string => typeof font === 'string')) throw new Error('Office preview returned invalid missing fonts')
    missingFonts = fonts
  }
  return { bytes, mimeType, missingFonts }
}
