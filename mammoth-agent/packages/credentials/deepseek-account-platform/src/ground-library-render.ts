/** Account-authorized, deferred Office source reads for the shared PDF converter. */
import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@mammoth-ai/cordis'
import { brandString } from '@mammoth-ai/mmp-brand'
import type { OfficeSourceKey, OfficeToPdfRequest, OfficeToPdfResult } from '@mammoth-ai/mmp-office-to-pdf'

type Converter = { convert(request: OfficeToPdfRequest, signal?: AbortSignal): Promise<OfficeToPdfResult> }
type Provider = { converter: Converter; signal: AbortSignal }
class RenderRefusal extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
class GroundRefusal extends Error {
  constructor(readonly status: number, readonly data: Buffer, readonly contentType: string) { super('Ground refused the source') }
}
function json(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ message }))
}

/**
 * Read a complete bounded Ground response and release its reader on every settlement.
 * @param response - authenticated Ground response.
 * @param maxBytes - maximum retained body bytes.
 * @param signal - operation cancellation.
 * @returns complete body; oversized or cancelled bodies reject.
 */
export async function readGroundLibraryResponse(response: Response, maxBytes: number, signal?: AbortSignal): Promise<Buffer> {
  const reader = response.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const parts: Uint8Array[] = []
  let size = 0
  const abort = (): void => { void reader.cancel().catch(() => undefined) }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    signal?.throwIfAborted()
    while (true) {
      const part = await reader.read()
      signal?.throwIfAborted()
      if (part.done) break
      size += part.value.byteLength
      if (size > maxBytes) throw new RenderRefusal(413, '资料超过预览大小限制，请下载原文件')
      parts.push(part.value)
    }
    return Buffer.concat(parts)
  } finally {
    signal?.removeEventListener('abort', abort)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/**
 * Bind optional conversion service and cancellation to the account Host's lifetime.
 * @param ctx - account provider scope; the converter may mount or unmount independently.
 * @param origin - fixed trusted Ground origin.
 * @param token - private current account credential.
 * @param reject - invalidate only the rejected captured credential.
 * @param timeoutMs - complete render request deadline.
 * @returns Host-only render handler; false leaves ordinary proxy routing to its owner.
 */
export function createGroundLibraryRenderer(
  ctx: Pick<Context, 'effect'> & Partial<Pick<Context, 'inject'>>,
  origin: string,
  token: () => Promise<string | undefined>,
  reject: (value: string) => Promise<void>,
  timeoutMs: number,
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  let provider: Provider | undefined
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() })
  ctx.inject?.(['officeToPdf'], (scope) => {
    const controller = new AbortController()
    const current = { converter: scope.officeToPdf, signal: controller.signal }
    scope.effect(() => {
      provider = current
      return () => { controller.abort(); if (provider === current) provider = undefined }
    })
  })
  return async (req, res) => {
    const raw = req.url ?? '/'
    if (req.method !== 'GET' || /%(?:2f|5c|2e)/i.test(raw) || raw.includes('\\') || raw.includes('..')) return false
    const url = new URL(raw, 'http://local.invalid')
    const match = /^\/ground-library\/nodes\/([A-Za-z0-9_-]+)\/render$/.exec(url.pathname)
    const nodeId = match?.[1]
    if (!nodeId) return false
    const versionId = url.searchParams.get('versionId')
    const extension = url.searchParams.get('extension')
    if (!versionId || !/^[A-Za-z0-9_-]+$/.test(versionId) || (extension !== 'doc' && extension !== 'docx' && extension !== 'ppt' && extension !== 'pptx')) {
      json(res, 400, 'Office 预览需要指定版本，支持 doc、docx、ppt、pptx'); return true
    }
    const captured = await token().catch(() => undefined)
    if (!captured) { json(res, 401, '请先登录猛犸账号'); return true }
    const current = provider
    if (!current) { json(res, 503, 'Office 预览服务不可用，请下载原文件'); return true }
    const controller = new AbortController()
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = AbortSignal.any([controller.signal, timeout, lifetime.signal, current.signal])
    const disconnect = (): void => { controller.abort() }
    req.once('aborted', disconnect)
    res.once('close', disconnect)
    if (res.destroyed) controller.abort()
    const checkAccount = async (upstream: AbortSignal): Promise<void> => {
      upstream.throwIfAborted()
      if (await token() !== captured) throw new RenderRefusal(409, '账号或企业已切换，请重新打开资料')
      upstream.throwIfAborted()
    }
    const request = async (operation: 'preview' | 'download', upstream: AbortSignal): Promise<Response> => {
      await checkAccount(upstream)
      const query = new URLSearchParams({ versionId })
      const response = await fetch(new URL(`/api/library/nodes/${nodeId}/${operation}?${query}`, origin), {
        headers: { authorization: `Bearer ${captured}`, accept: operation === 'preview' ? 'application/json' : 'application/octet-stream' },
        redirect: 'error', signal: upstream,
      })
      try { await checkAccount(upstream) } catch (error) { await response.body?.cancel().catch(() => undefined); throw error }
      if (!response.ok) {
        const data = await readGroundLibraryResponse(response, 1024 * 1024, upstream)
        await checkAccount(upstream)
        if (response.status === 401) void reject(captured).catch(() => undefined)
        throw new GroundRefusal(response.status, data, response.headers.get('content-type') ?? 'application/json; charset=utf-8')
      }
      return response
    }
    try {
      const metadataResponse = await request('preview', signal)
      const metadata: unknown = JSON.parse((await readGroundLibraryResponse(metadataResponse, 1024 * 1024, signal)).toString('utf8'))
      await checkAccount(signal)
      if (!metadata || typeof metadata !== 'object' || !('nodeId' in metadata) || metadata.nodeId !== nodeId
        || !('versionId' in metadata) || metadata.versionId !== versionId) throw new RenderRefusal(409, '资料版本已变化，请重新打开资料')
      if ('previewKind' in metadata && (metadata.previewKind === 'blocked' || metadata.previewKind === 'link')) {
        throw new RenderRefusal(409, 'parseReason' in metadata && typeof metadata.parseReason === 'string' ? metadata.parseReason : '资料当前不能预览，请重新打开资料')
      }
      const originalName = 'originalName' in metadata ? metadata.originalName : 'name' in metadata ? metadata.name : undefined
      if (typeof originalName !== 'string' || !originalName.toLowerCase().endsWith('.' + extension)) {
        throw new RenderRefusal(400, '文件格式与授权资料不一致，请重新打开资料或下载原文件')
      }
      const accountKey = createHash('sha256').update(captured).digest('hex')
      const result = await current.converter.convert({ extension, priority: 'foreground', source: {
        key: brandString<OfficeSourceKey>(JSON.stringify([origin, accountKey, nodeId, versionId])),
        version: versionId,
        read: async (sharedSignal, maxBytes) => {
          // The provider owns this shared read; a cancelled individual reader cannot cancel another admitted reader.
          await checkAccount(sharedSignal)
          const response = await request('download', sharedSignal)
          const bytes = await readGroundLibraryResponse(response, maxBytes, sharedSignal)
          await checkAccount(sharedSignal)
          return { bytes, version: versionId }
        },
      } }, signal)
      await checkAccount(signal)
      res.writeHead(200, { 'content-type': 'application/pdf', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
        'x-mmp-missing-fonts': encodeURIComponent(JSON.stringify(result.missingFonts)) })
      res.end(result.pdf)
    } catch (error) {
      if (res.destroyed) return true
      if (res.headersSent) { res.destroy(); return true }
      if (timeout.aborted) json(res, 504, 'Office 预览超时，请重试或下载原文件')
      else if (signal.aborted) json(res, 503, 'Office 预览已取消，请重新打开资料')
      else if (error instanceof GroundRefusal) {
        res.writeHead(error.status, { 'content-type': error.contentType, 'cache-control': 'no-store' }); res.end(error.data)
      } else if (error instanceof RenderRefusal) json(res, error.status, error.message)
      else json(res, 502, 'Office 转换失败，请重试或下载原文件')
    } finally {
      req.off('aborted', disconnect)
      res.off('close', disconnect)
    }
    return true
  }
}
