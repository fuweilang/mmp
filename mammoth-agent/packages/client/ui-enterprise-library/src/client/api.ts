import type { LibraryChoice, LibraryKind } from './selection.ts'

export type LibraryView = 'recent' | 'mine' | 'shared' | 'trash'

type RawVersion = {
  id?: string
  versionNo?: number
  parseStatus?: string
  parseReason?: string | null
}

type RawItem = {
  id?: string
  name?: string
  kind?: LibraryKind
  currentVersion?: RawVersion | null
}

/** Same-origin or configured ground origin. The query never carries a tenant id. */
export function libraryItemsUrl(origin: string, view: LibraryView, q = ''): string {
  const base = origin.replace(/\/$/, '')
  const params = new URLSearchParams({ view })
  const query = q.trim()
  if (query) params.set('q', query)
  return `${base}/api/library/items?${params.toString()}`
}

export function libraryOpenUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/library/open`
}

export function readLibraryItems(payload: unknown): LibraryChoice[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { items?: unknown }).items)) return []
  return (payload as { items: RawItem[] }).items.flatMap((item) => {
    if (!item.id || !item.name || (item.kind !== 'FILE' && item.kind !== 'FOLDER' && item.kind !== 'LINK')) return []
    return [{
      nodeId: item.id,
      name: item.name,
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
export async function fetchLibraryItems(origin: string, view: LibraryView, q: string, fetchImpl: LibraryFetch, signal?: AbortSignal): Promise<LibraryChoice[]> {
  const init: RequestInit = { credentials: 'include' }
  if (signal) init.signal = signal
  const response = await fetchImpl(libraryItemsUrl(origin, view, q), init)
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
