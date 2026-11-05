/** Cap Ground chat POST body under gateway/nginx byte limits and model context windows. */
import type { OpenAiMessage } from './openai-map.ts'

/** Soft ceiling under nginx/Nest `50mb` (`client_max_body_size 50m`). */
export const DEFAULT_GROUND_CHAT_BODY_MAX_BYTES = 45 * 1024 * 1024

/** Fixed-density heuristic aligned with mmp-token-meter (chars/4). */
export const CHARS_PER_TOKEN = 4

/** Leave headroom under the advertised context window for completion + framing. */
export const DEFAULT_CONTEXT_FIT_RATIO = 0.9

const TOOL_HEAD_CHARS = 2_048
const TOOL_TAIL_CHARS = 512
const TOOL_MARK = '\n…[tool result truncated for gateway body budget]…\n'

const encoder = new TextEncoder()

export function utf8ByteLength(text: string): number {
  return encoder.encode(text).byteLength
}

export function jsonByteLength(value: unknown): number {
  return utf8ByteLength(JSON.stringify(value))
}

/** Rough prompt-token estimate for an OpenAI-shaped chat body. */
export function estimateChatBodyTokens(body: { messages: OpenAiMessage[] }): number {
  // JSON framing is charged too — same density as content — so stringify is enough.
  return Math.ceil(jsonByteLength(body) / CHARS_PER_TOKEN)
}

export function resolveGroundChatBodyMaxBytes(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): number {
  const raw = env.GROUND_CHAT_BODY_MAX_BYTES?.trim()
  if (!raw) return DEFAULT_GROUND_CHAT_BODY_MAX_BYTES
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 64_000) return DEFAULT_GROUND_CHAT_BODY_MAX_BYTES
  return Math.floor(n)
}

/**
 * Soft prompt-token budget from a model context window.
 * Reserves completion tokens (explicit max or a conservative default).
 */
export function resolveContextTokenBudget(
  contextWindow: number,
  reservedCompletionTokens = 8_192,
  fitRatio = DEFAULT_CONTEXT_FIT_RATIO,
): number {
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) return Number.POSITIVE_INFINITY
  const reserved = Math.max(0, Math.floor(reservedCompletionTokens))
  const ratio = Number.isFinite(fitRatio) && fitRatio > 0 && fitRatio <= 1 ? fitRatio : DEFAULT_CONTEXT_FIT_RATIO
  const budget = Math.floor(contextWindow * ratio) - reserved
  return Math.max(1_024, budget)
}

function shrinkToolText(content: string): string {
  if (content.length <= TOOL_HEAD_CHARS + TOOL_TAIL_CHARS + TOOL_MARK.length) return content
  return `${content.slice(0, TOOL_HEAD_CHARS)}${TOOL_MARK}${content.slice(-TOOL_TAIL_CHARS)}`
}

function shrinkMessagePayload(message: OpenAiMessage): OpenAiMessage {
  if (message.role === 'tool') {
    return { ...message, content: shrinkToolText(message.content) }
  }
  if (message.role === 'assistant') {
    let next: OpenAiMessage = message
    if (typeof message.content === 'string' && message.content.length > TOOL_HEAD_CHARS + TOOL_TAIL_CHARS) {
      next = { ...next, content: shrinkToolText(message.content) }
    }
    if (typeof message.reasoning_content === 'string' && message.reasoning_content.length > TOOL_HEAD_CHARS) {
      next = {
        ...next,
        reasoning_content: shrinkToolText(message.reasoning_content),
      }
    }
    return next
  }
  if ((message.role === 'user' || message.role === 'system') && typeof message.content === 'string') {
    if (message.content.length > TOOL_HEAD_CHARS * 4) {
      return { ...message, content: shrinkToolText(message.content) }
    }
  }
  return message
}

/** Drop one leading non-system turn (user[+assistant[+tools]] or orphan tools). */
function dropOldestNonSystemTurn(messages: OpenAiMessage[]): OpenAiMessage[] | undefined {
  const start = messages.findIndex(message => message.role !== 'system')
  if (start < 0) return undefined
  const nonSystem = messages.length - start
  // Keep at least the latest exchange so the model still sees the current ask.
  if (nonSystem <= 2) return undefined

  let dropCount = 1
  const first = messages[start]!
  if (first.role === 'user') {
    if (messages[start + 1]?.role === 'assistant') {
      dropCount = 2
      while (start + dropCount < messages.length && messages[start + dropCount]?.role === 'tool') {
        dropCount += 1
      }
    }
  } else if (first.role === 'assistant' && first.tool_calls && first.tool_calls.length > 0) {
    while (start + dropCount < messages.length && messages[start + dropCount]?.role === 'tool') {
      dropCount += 1
    }
  } else if (first.role === 'tool') {
    while (start + dropCount < messages.length && messages[start + dropCount]?.role === 'tool') {
      dropCount += 1
    }
  }

  if (start + dropCount >= messages.length) return undefined
  return [...messages.slice(0, start), ...messages.slice(start + dropCount)]
}

export interface FitChatBodyResult<T extends { messages: OpenAiMessage[] }> {
  body: T
  bytes: number
  tokens: number
  trimmed: boolean
}

type FitMetric = 'bytes' | 'tokens'

function measure(body: { messages: OpenAiMessage[] }, metric: FitMetric): number {
  return metric === 'bytes' ? jsonByteLength(body) : estimateChatBodyTokens(body)
}

/**
 * Shared shrink/drop fence: keep system + recent turns; shrink then drop older history.
 * Used for both gateway byte budgets and model context-window token budgets.
 */
function fitChatCompletionsByMetric<T extends { messages: OpenAiMessage[] }>(
  body: T,
  maxValue: number,
  metric: FitMetric,
): FitChatBodyResult<T> {
  const initial = measure(body, metric)
  if (initial <= maxValue) {
    return {
      body,
      bytes: metric === 'bytes' ? initial : jsonByteLength(body),
      tokens: metric === 'tokens' ? initial : estimateChatBodyTokens(body),
      trimmed: false,
    }
  }

  let messages = body.messages.map(message => ({ ...message })) as OpenAiMessage[]
  let trimmed = false

  // Pass 1: shrink older tool / bulky payloads, preserve a recent tail intact first.
  const preserveTail = 16
  const shrinkUntil = Math.max(0, messages.length - preserveTail)
  for (let i = 0; i < shrinkUntil; i += 1) {
    const before = messages[i]!
    const after = shrinkMessagePayload(before)
    if (after !== before) {
      messages[i] = after
      trimmed = true
    }
  }
  let next = { ...body, messages }
  let value = measure(next, metric)
  if (value <= maxValue) {
    return {
      body: next,
      bytes: jsonByteLength(next),
      tokens: estimateChatBodyTokens(next),
      trimmed,
    }
  }

  // Pass 2: shrink every remaining bulky message (including recent tail).
  messages = messages.map(message => {
    const after = shrinkMessagePayload(message)
    if (after !== message) trimmed = true
    return after
  })
  next = { ...body, messages }
  value = measure(next, metric)
  if (value <= maxValue) {
    return {
      body: next,
      bytes: jsonByteLength(next),
      tokens: estimateChatBodyTokens(next),
      trimmed,
    }
  }

  // Pass 3: drop oldest non-system turns while keeping system + latest ask.
  for (let guard = 0; guard < 10_000 && value > maxValue; guard += 1) {
    const dropped = dropOldestNonSystemTurn(messages)
    if (dropped === undefined) break
    messages = dropped
    trimmed = true
    next = { ...body, messages }
    value = measure(next, metric)
  }

  // Pass 4: last resort — hard-slice remaining large strings.
  if (value > maxValue) {
    messages = messages.map(message => {
      if (message.role === 'tool' && message.content.length > 256) {
        trimmed = true
        return { ...message, content: `${message.content.slice(0, 128)}…` }
      }
      if (message.role === 'assistant') {
        let m: OpenAiMessage = message
        if (typeof message.content === 'string' && message.content.length > 512) {
          trimmed = true
          m = { ...m, content: `${message.content.slice(0, 256)}…` }
        }
        if (typeof message.reasoning_content === 'string' && message.reasoning_content.length > 256) {
          trimmed = true
          m = { ...m, reasoning_content: `${message.reasoning_content.slice(0, 128)}…` }
        }
        return m
      }
      if (message.role === 'user' && typeof message.content === 'string' && message.content.length > 4_096) {
        // Prefer keeping the end of the latest user ask.
        trimmed = true
        return { ...message, content: `…${message.content.slice(-3_500)}` }
      }
      return message
    })
    next = { ...body, messages }
  }

  return {
    body: next,
    bytes: jsonByteLength(next),
    tokens: estimateChatBodyTokens(next),
    trimmed,
  }
}

/**
 * Keep system + recent turns; shrink/drop older tool-heavy history until JSON body fits.
 * Complements token-level compaction — this is a hard gateway byte fence.
 */
export function fitChatCompletionsBody<T extends { messages: OpenAiMessage[] }>(
  body: T,
  maxBytes: number = DEFAULT_GROUND_CHAT_BODY_MAX_BYTES,
): FitChatBodyResult<T> {
  return fitChatCompletionsByMetric(body, maxBytes, 'bytes')
}

/**
 * Same shrink/drop policy as {@link fitChatCompletionsBody}, measured in heuristic tokens
 * against a model context-window budget (not gateway bytes).
 */
export function fitChatCompletionsToTokenBudget<T extends { messages: OpenAiMessage[] }>(
  body: T,
  maxTokens: number,
): FitChatBodyResult<T> {
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    return {
      body,
      bytes: jsonByteLength(body),
      tokens: estimateChatBodyTokens(body),
      trimmed: false,
    }
  }
  return fitChatCompletionsByMetric(body, Math.floor(maxTokens), 'tokens')
}

/**
 * Fit for Ground: context-window token budget first, then gateway byte fence.
 * Prefer shrink over drop; never strip the system prompt or the latest ask.
 */
export function fitGroundChatCompletionsBody<T extends { messages: OpenAiMessage[] }>(
  body: T,
  options: {
    maxBytes?: number
    contextWindow?: number
    reservedCompletionTokens?: number
    fitRatio?: number
  } = {},
): FitChatBodyResult<T> {
  const maxBytes = options.maxBytes ?? DEFAULT_GROUND_CHAT_BODY_MAX_BYTES
  let current = body
  let trimmed = false

  if (options.contextWindow !== undefined) {
    const tokenBudget = resolveContextTokenBudget(
      options.contextWindow,
      options.reservedCompletionTokens,
      options.fitRatio,
    )
    const byTokens = fitChatCompletionsToTokenBudget(current, tokenBudget)
    current = byTokens.body
    trimmed = trimmed || byTokens.trimmed
  }

  const byBytes = fitChatCompletionsBody(current, maxBytes)
  return {
    body: byBytes.body,
    bytes: byBytes.bytes,
    tokens: byBytes.tokens,
    trimmed: trimmed || byBytes.trimmed,
  }
}
