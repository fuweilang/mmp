/** OpenAI-compatible Ground chat adapter. */
import { Buffer } from 'node:buffer'
import type { AttachmentStore, ImageAttachmentRef } from '@mammoth-ai/mmp-attachment'
import { ACCOUNT_QUOTA_EXCEEDED_CODE, attributionHeaders, LlmAdapter, LlmError } from '@mammoth-ai/mmp-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@mammoth-ai/mmp-llm'
import type { DeepSeekAccount } from '@mammoth-ai/mmp-deepseek-account'
import type { SessionId } from '@mammoth-ai/mmp-session'
import type { GroundOfficialAttribution, GroundWireGuard } from './attribution.ts'
import { chatCompletionsUrl, modelsUrl } from './config.ts'
import { OpenAiSseTranslator, toOpenAiMessages, toOpenAiTools, type GroundRequestImage } from './openai-map.ts'
import { loggedFetch } from './http-log.ts'
import { fitGroundChatCompletionsBody, resolveGroundChatBodyMaxBytes } from './body-budget.ts'

export interface GroundModelRow {
  id: string
  name: string
  preferred: boolean
  contextWindow?: number
  vision?: boolean
}

export interface GroundAdapterOptions {
  providerId: string
  displayName: string
  origin: string
  account: () => DeepSeekAccount | undefined
  /** Official version bound to the requesting Session, when this is an official Agent run. */
  officialFor?: (sessionId: SessionId) => GroundOfficialAttribution | undefined
  /** Durable image bytes for vision requests. Text-only routes never read it. */
  attachments?: () => AttachmentStore | undefined
  /** Validates logged Session invariants after final fitting and before HTTP. */
  validateWire?: GroundWireGuard
}

async function readSseOrJsonError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) return `HTTP ${response.status}`
  try {
    const json = JSON.parse(text) as { error?: { message?: string }; message?: string }
    return json.error?.message || json.message || text.slice(0, 400)
  } catch {
    return text.slice(0, 400)
  }
}

export class GroundLlmAdapter extends LlmAdapter {
  private catalog: GroundModelRow[] = []
  private catalogAt = 0

  constructor(private readonly options: GroundAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: this.options.displayName }
  }

  private async resolveToken(): Promise<string> {
    const account = this.options.account()
    if (account === undefined) {
      throw new LlmError('Sign in to 猛犸 to use cloud models.', 'ACCOUNT_SIGN_IN_REQUIRED')
    }
    const token = await account.resolveToken(this.options.origin)
    if (token === undefined || token.trim().length === 0) {
      throw new LlmError('Sign in to 猛犸 to use cloud models.', 'ACCOUNT_SIGN_IN_REQUIRED')
    }
    return token
  }

  private async refreshCatalog(signal?: AbortSignal): Promise<GroundModelRow[]> {
    const token = await this.resolveToken()
    const response = await loggedFetch(modelsUrl(this.options.origin), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...attributionHeaders(),
      },
      ...(signal ? { signal } : {}),
    })
    if (response.status === 401 || response.status === 403) {
      try { await this.options.account()?.rejectToken(token) }
      catch { /* ignore */ }
      throw new LlmError('猛犸登录已失效，请重新登录。', 'ACCOUNT_TOKEN_INVALID', { status: response.status })
    }
    if (!response.ok) {
      throw new LlmError(`Failed to list Ground models: ${await readSseOrJsonError(response)}`, 'SERVER', {
        status: response.status,
      })
    }
    const body = await response.json() as {
      data?: Array<{ id?: string; display_name?: string; is_preferred?: boolean; capabilities?: { contextWindow?: number; vision?: boolean } }>
    }
    const rows: GroundModelRow[] = []
    for (const item of body.data ?? []) {
      const id = String(item.id || '').trim()
      if (!id) continue
      rows.push({
        id,
        name: String(item.display_name || id),
        preferred: item.is_preferred === true,
        contextWindow: typeof item.capabilities?.contextWindow === 'number' && item.capabilities.contextWindow >= 1024 ? item.capabilities.contextWindow : 128_000,
        vision: item.capabilities?.vision === true,
      })
    }
    const concrete = rows.filter(row => row.id !== 'auto')
    if(concrete.length===0)throw new LlmError('Admin cloud model catalog is not ready; no local fallback is allowed.','UNKNOWN_MODEL')
    rows.splice(0, rows.length, { id: 'auto', name: 'Automatic', preferred: true,
      contextWindow: Math.min(128_000, ...concrete.map(row => row.contextWindow ?? 128_000)), vision: concrete.some(row => row.vision) }, ...concrete)
    this.catalog = rows
    this.catalogAt = Date.now()
    return rows
  }

  async ensureCatalog(signal?: AbortSignal): Promise<GroundModelRow[]> {
    if (this.catalog.length > 0 && Date.now() - this.catalogAt < 15_000) return this.catalog
    try {
      return await this.refreshCatalog(signal)
    } catch (error) {
      if (this.catalog.length > 0) return this.catalog
      throw error
    }
  }

  /** Refresh once and report a pool change; the plugin owns polling and cancellation. */
  async observeCatalog(signal: AbortSignal): Promise<boolean> {
    const before = JSON.stringify(this.catalog)
    await this.refreshCatalog(signal)
    return before !== JSON.stringify(this.catalog)
  }

  pickDefaultModelId(rows: readonly GroundModelRow[]): string | undefined {
    return rows.find(row => row.preferred)?.id ?? rows[0]?.id
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    if (provider !== this.options.providerId) return []
    try {
      // Always hit Ground for catalog listings so admin enable/disable is visible
      // without waiting out the short ensureCatalog TTL.
      const rows = await this.refreshCatalog()
      return rows.map(row => ({
        provider,
        id: row.id,
        name: row.name,
        inputModalities: row.vision ? ['text', 'image'] as const : ['text'] as const,
      }))
    } catch (error) {
      if (error instanceof LlmError && (error.code === 'ACCOUNT_SIGN_IN_REQUIRED' || error.code === 'ACCOUNT_TOKEN_INVALID')) {
        return []
      }
      // Fall back to the last good catalog if Ground blips during a menu open.
      if (this.catalog.length > 0) {
        return this.catalog.map(row => ({
          provider,
          id: row.id,
          name: row.name,
          inputModalities: row.vision ? ['text', 'image'] as const : ['text'] as const,
        }))
      }
      throw error
    }
  }

  override async resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const rows = await this.ensureCatalog(signal)
    let id = model
    if (id === 'auto' || id === '*' || id.trim() === '') {
      const automatic = rows.find(row => row.id === 'auto')
      return { provider, id: 'auto', name: 'Automatic', inputModalities: automatic?.vision ? ['text', 'image'] : ['text'], context: { contextWindow: automatic?.contextWindow ?? 128_000 } }
    }
    let hit = rows.find(row => row.id === id)
    if (hit === undefined) {
      // Accept bare / display names from sticky deepseek-official eras
      // (e.g. "deepseek-flash" → "deepseek/deepseek-flash").
      hit = rows.find(row =>
        row.id.endsWith(`/${id}`) || row.name === id || row.name === model)
    }
    // Sticky/default refs removed from the Admin pool must never hit the old ID.
    if(hit===undefined)throw new LlmError('Selected cloud model is unavailable. Choose Automatic or an enabled model.','UNKNOWN_MODEL')
    if(hit===undefined)throw new LlmError('Admin cloud model catalog unavailable.','UNKNOWN_MODEL')

    return {
      provider,
      id: hit.id,
      name: hit.name,
      context: { contextWindow: hit.contextWindow ?? 128_000 },
      inputModalities: hit.vision ? ['text', 'image'] : ['text'],
    }
  }

  override imageRequestTarget(_provider: string, _model: string, image: ImageAttachmentRef) {
    const edge = Math.max(image.width, image.height, 1)
    const scale = Math.min(1, 2048 / edge)
    return {
      width: Math.max(1, Math.round(image.width * scale)),
      height: Math.max(1, Math.round(image.height * scale)),
      maxBytes: Math.min(image.bytes, 4 * 1024 * 1024),
    }
  }

  private async encodedImages(options: GenerateOptions): Promise<Map<string, GroundRequestImage>> {
    const images = new Map<string, GroundRequestImage>()
    const pending: ImageAttachmentRef[] = []
    for (const message of options.messages) {
      if (message.role !== 'user' && message.role !== 'tool') continue
      for (const block of message.content) {
        if (block.type !== 'image' || block.offloaded === true) continue
        if (pending.some(item => item.attachmentId === block.attachment.attachmentId)) continue
        pending.push(block.attachment)
      }
    }
    if (pending.length === 0) return images
    const store = this.options.attachments?.()
    if (store === undefined) {
      throw new LlmError('Image input requires the attachment store.', 'UNSUPPORTED_CONTENT')
    }
    for (const ref of pending) {
      const version = await store.readImageRequest(
        ref,
        this.imageRequestTarget(options.provider, options.model, ref),
        options.signal,
      )
      images.set(String(ref.attachmentId), {
        mediaType: version.mediaType,
        base64: Buffer.from(version.data).toString('base64'),
      })
    }
    return images
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const resolved = await this.resolveModel(options.provider, options.model, options.signal)
    const token = await this.resolveToken()
    const images = await this.encodedImages(options)
    const rawBody = {
      model: resolved.id,
      messages: toOpenAiMessages(options, images),
      stream: true,
      stream_options: { include_usage: true },
      ...options.temperature === undefined ? {} : { temperature: options.temperature },
      ...options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens },
      ...options.stop === undefined ? {} : { stop: options.stop },
      ...toOpenAiTools(options.tools) === undefined ? {} : { tools: toOpenAiTools(options.tools) },
    }
    // Context-window token fit first, then gateway/nginx byte fence.
    // Upstream mmp-compaction-* still owns durable summarization; this is a send-time fence.
    const fitted = fitGroundChatCompletionsBody(rawBody, {
      maxBytes: resolveGroundChatBodyMaxBytes(),
      ...(resolved.context?.contextWindow === undefined ? {} : { contextWindow: resolved.context.contextWindow }),
      reservedCompletionTokens: options.maxTokens ?? 8_192,
    })
    const body = fitted.body
    if (fitted.trimmed) {
      console.warn(
        '[llm-ground] chat body trimmed for context/byte budget',
        `bytes=${fitted.bytes}`,
        `tokens~=${fitted.tokens}`,
        `messages=${body.messages.length}`,
      )
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...attributionHeaders(),
    }
    if (options.sessionId !== undefined) {
      headers['x-mmp-session-id'] = options.sessionId
      const official = this.options.officialFor?.(options.sessionId)
      if (options.purpose === 'compaction' || options.purpose === 'session-title') {
        headers['x-mmp-helper-purpose'] = options.purpose
        if (official !== undefined) {
          headers['x-mmp-origin-agent-id'] = official.agentId
          if (official.previewId) headers['x-mmp-origin-preview-id'] = official.previewId
          else if (official.versionId) headers['x-mmp-origin-version-id'] = official.versionId
        }
      }
      if (official !== undefined && options.purpose === undefined) {
        headers['x-mmp-official-agent-id'] = official.agentId
        if(official.previewId)headers['x-mmp-expert-preview-id']=official.previewId
        else if(official.versionId)headers['x-mmp-official-agent-version-id'] = official.versionId
      }
    }
    this.options.validateWire?.(options, body)
    const serializedBody=JSON.stringify(body)
    options.signal?.throwIfAborted()
    let response: Response
    try {
      response = await loggedFetch(chatCompletionsUrl(this.options.origin), {
        method: 'POST',
        headers,
        body: serializedBody,
        ...(options.signal ? { signal: options.signal } : {}),
      })
    } catch (error) {
      if (options.signal?.aborted) {
        throw new LlmError('Ground request aborted', 'ABORTED', { cause: error })
      }
      throw new LlmError('Ground gateway unreachable', 'TRANSPORT', { cause: error })
    }
    if (response.status === 401 || response.status === 403) {
      try { await this.options.account()?.rejectToken(token) }
      catch { /* ignore */ }
      throw new LlmError('猛犸登录已失效，请重新登录。', 'ACCOUNT_TOKEN_INVALID', { status: response.status })
    }
    if (response.status === 402) {
      let detail = ''
      try {
        const j = (await response.json()) as { balanceCoins?: unknown; requiredCoins?: unknown }
        if (typeof j?.balanceCoins === 'number') {
          detail = `（余额 ${j.balanceCoins} 币` + (typeof j.requiredCoins === 'number' ? `，需 ${j.requiredCoins} 币` : '') + '）'
        }
      } catch { /* ignore */ }
      throw new LlmError(`企业 AI 币不足${detail}，请充值后再试。`, ACCOUNT_QUOTA_EXCEEDED_CODE, { status: 402 })
      // ACCOUNT_QUOTA → ui-chat quota notice → account RechargeDialog「去充值」.
    }
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get('retry-after'))
      throw new LlmError(await readSseOrJsonError(response), 'RATE_LIMIT', {
        status: 429,
        ...Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? { providerRetryAfterMs: retryAfterSeconds * 1000 }
          : {},
      })
    }
    if (response.status === 413) {
      // Gateway body limit — not transient; do not burn the SERVER retry budget.
      throw new LlmError(
        'request entity too large — conversation context exceeds the cloud gateway limit; start a new chat or shorten history',
        'INVALID_REQUEST',
        { status: 413 },
      )
    }
    if (!response.ok) {
      const requestId = response.headers.get('x-request-id')
      throw new LlmError(`${await readSseOrJsonError(response)}${requestId ? ` [request ${requestId}]` : ''}`, 'SERVER', { status: response.status })
    }
    if (response.body === null) {
      // Non-stream JSON fallback
      const json = await response.json() as {
        choices?: Array<{ message?: { content?: string; tool_calls?: unknown }; finish_reason?: string }>
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
      }
      const translator = new OpenAiSseTranslator()
      const message = json.choices?.[0]?.message
      const synthetic = {
        choices: [{
          delta: {
            content: message?.content ?? '',
            tool_calls: Array.isArray(message?.tool_calls)
              ? (message.tool_calls as Array<{ id?: string; function?: { name?: string; arguments?: string } }>).map((call, index) => ({
                index,
                id: call.id,
                function: call.function,
              }))
              : undefined,
          },
          finish_reason: json.choices?.[0]?.finish_reason ?? 'stop',
        }],
        usage: json.usage,
      }
      yield * translator.pushData(JSON.stringify(synthetic))
      yield * translator.finish()
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const translator = new OpenAiSseTranslator()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split(/\r?\n/)
        buffer = parts.pop() ?? ''
        for (const line of parts) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          yield * translator.pushData(payload)
        }
      }
      if (buffer.trim().startsWith('data:')) {
        yield * translator.pushData(buffer.trim().slice(5).trim())
      }
      yield * translator.finish()
    } catch (error) {
      if (options.signal?.aborted) {
        throw new LlmError('Ground request aborted', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError(`Ground stream interrupted; retry manually. [request ${response.headers.get('x-request-id') ?? 'unavailable'}]`, 'INVALID_REQUEST', { cause: error })
    } finally {
      try { reader.releaseLock() }
      catch { /* ignore */ }
    }
  }
}
