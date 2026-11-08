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

/** List one view. Credentials stay on the request; tenant id is not sent. */
export async function fetchLibraryItems(origin: string, view: LibraryView, q: string, fetchImpl: LibraryFetch, signal?: AbortSignal, parentId?: string | null, flat = false): Promise<LibraryChoice[]> {
  const init: RequestInit = { credentials: 'include' }
  if (signal) init.signal = signal
  const response = await fetchImpl(libraryItemsUrl(origin, view, q, parentId, flat), init)
  if (!response.ok) throw new Error(`library list ${response.status}`)
  return readLibraryItems(await response.json())
}

export type OpenedSource = {
  readonly name: string
  readonly versionId: string
  readonly locator: string | null
  readonly quote: string | null
}

/** Re-check one version. The body is whatever the server still allows. */
export async function fetchLibrarySource(
  origin: string,
  nodeId: string,
  versionId: string,
  fetchImpl: LibraryFetch,
  signal?: AbortSignal,
): Promise<OpenedSource> {
  const init: RequestInit = {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId, versionId }),
  }
  if (signal) init.signal = signal
  const response = await fetchImpl(libraryOpenUrl(origin), init)
  if (!response.ok) throw new Error(`library open ${response.status}`)
  const body = await response.json() as { name?: unknown; versionId?: unknown; locator?: unknown; quote?: unknown }
  if (typeof body.name !== 'string' || typeof body.versionId !== 'string' || body.versionId !== versionId) {
    throw new Error('library open returned a different version')
  }
  return {
    name: body.name,
    versionId: body.versionId,
    locator: typeof body.locator === 'string' ? body.locator : null,
    quote: typeof body.quote === 'string' ? body.quote : null,
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
