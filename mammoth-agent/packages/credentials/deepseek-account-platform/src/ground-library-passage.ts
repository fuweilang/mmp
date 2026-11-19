/** Follow-up reads for one library file already found by library_search. */
import { defineTool, type ToolDefinition } from '@mammoth-ai/mmp-tools'
import type { Context } from '@mammoth-ai/cordis'

async function libraryGet(
  origin: string, path: string, token: () => Promise<string | undefined>,
  reject: (value: string) => Promise<void>, timeoutMs: number, lifetime: AbortSignal,
): Promise<unknown> {
  lifetime.throwIfAborted()
  const captured = await token()
  if (!captured) throw new Error('LIBRARY_SIGN_IN_REQUIRED')
  const signal = AbortSignal.any([lifetime, AbortSignal.timeout(timeoutMs)])
  const response = await fetch(new URL(path, origin), {
    method: 'GET', redirect: 'error',
    headers: { authorization: `Bearer ${captured}`, accept: 'application/json' },
    signal,
  })
  if (response.status === 401) await reject(captured)
  if (await token() !== captured) throw new Error('LIBRARY_ACCOUNT_CHANGED')
  if (!response.ok) throw new Error('LIBRARY_READ_UNAVAILABLE')
  return response.json()
}

type LibraryPassage = { nodeId: string, versionId: string, versionNo: number, name: string, passages: { locator: string, text: string }[] }
type LibraryRows = { nodeId: string, versionId: string, name: string, rows: string[] }

function readPassage(payload: unknown): LibraryPassage {
  if (!payload || typeof payload !== 'object') throw new Error('LIBRARY_READ_INVALID')
  const body = payload as Record<string, unknown>
  if (typeof body.nodeId !== 'string' || typeof body.versionId !== 'string' || typeof body.versionNo !== 'number' || typeof body.name !== 'string' || !Array.isArray(body.passages)) {
    throw new Error('LIBRARY_READ_INVALID')
  }
  const passages = body.passages.map((row) => {
    if (!row || typeof row !== 'object') return undefined
    const item = row as Record<string, unknown>
    if (typeof item.locator !== 'string' || typeof item.text !== 'string') return undefined
    return { locator: item.locator, text: item.text }
  })
  if (passages.some(row => row === undefined)) throw new Error('LIBRARY_READ_INVALID')
  return { nodeId: body.nodeId, versionId: body.versionId, versionNo: body.versionNo, name: body.name, passages: passages as LibraryPassage['passages'] }
}

function readRows(payload: unknown): LibraryRows {
  if (!payload || typeof payload !== 'object') throw new Error('LIBRARY_READ_INVALID')
  const body = payload as Record<string, unknown>
  if (typeof body.nodeId !== 'string' || typeof body.versionId !== 'string' || typeof body.name !== 'string' || !Array.isArray(body.rows) || body.rows.some(row => typeof row !== 'string')) {
    throw new Error('LIBRARY_READ_INVALID')
  }
  return { nodeId: body.nodeId, versionId: body.versionId, name: body.name, rows: body.rows as string[] }
}

export function createGroundLibraryReadTool(
  origin: string, token: () => Promise<string | undefined>,
  reject: (value: string) => Promise<void>, timeoutMs: number, lifetime: AbortSignal,
): ToolDefinition {
  return defineTool({
    name: 'library_read',
    description: 'Read one library passage and the passages next to it. Use the version and locator returned by library_search when the excerpt is too short to answer.',
    parameters: {
      nodeId: { type: 'string', required: true, description: 'nodeId returned by library_search.' },
      versionId: { type: 'string', required: true, description: 'versionId returned by library_search.' },
      locator: { type: 'string', description: 'locator returned by library_search. Omit to read the opening passages.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          nodeId: { type: 'string', required: true },
          versionId: { type: 'string', required: true },
          versionNo: { type: 'number', required: true },
          name: { type: 'string', required: true },
          passages: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                locator: { type: 'string', required: true },
                text: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.passages.map(row => `[${value.name}] ${row.locator}\n${row.text}`).join('\n\n') || `No passage in ${value.name}.` }],
    },
    async execute(args) {
      const path = `/api/library/nodes/${encodeURIComponent(args.nodeId)}/around?versionId=${encodeURIComponent(args.versionId)}${args.locator ? `&locator=${encodeURIComponent(args.locator)}` : ''}`
      return readPassage(await libraryGet(origin, path, token, reject, timeoutMs, lifetime))
    },
  })
}

export function createGroundLibraryRowsTool(
  origin: string, token: () => Promise<string | undefined>,
  reject: (value: string) => Promise<void>, timeoutMs: number, lifetime: AbortSignal,
): ToolDefinition {
  return defineTool({
    name: 'library_rows',
    description: 'Return spreadsheet or table rows from one library file that contain a short phrase. Use the version returned by library_search.',
    parameters: {
      nodeId: { type: 'string', required: true, description: 'nodeId returned by library_search.' },
      versionId: { type: 'string', required: true, description: 'versionId returned by library_search.' },
      q: { type: 'string', required: true, description: 'One short phrase to find in a row, 2–40 characters.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          nodeId: { type: 'string', required: true },
          versionId: { type: 'string', required: true },
          name: { type: 'string', required: true },
          rows: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.rows.length === 0 ? `No row in ${value.name} matched.` : value.rows.join('\n') }],
    },
    async execute(args) {
      const path = `/api/library/nodes/${encodeURIComponent(args.nodeId)}/rows?versionId=${encodeURIComponent(args.versionId)}&q=${encodeURIComponent(args.q)}`
      return readRows(await libraryGet(origin, path, token, reject, timeoutMs, lifetime))
    },
  })
}

export function installGroundLibraryPassage(
  ctx: Context, origin: string, token: () => Promise<string | undefined>,
  reject: (value: string) => Promise<void>, timeoutMs: number,
): void {
  ctx.inject(['tools'], (host) => {
    const lifetime = new AbortController()
    host.effect(() => () => { lifetime.abort() })
    host.tools.register(createGroundLibraryReadTool(origin, token, reject, timeoutMs, lifetime.signal))
    host.tools.register(createGroundLibraryRowsTool(origin, token, reject, timeoutMs, lifetime.signal))
  })
}
