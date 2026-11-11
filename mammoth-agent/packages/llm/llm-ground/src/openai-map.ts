import { LlmError } from '@mammoth-ai/mmp-llm'
/** Map Harness GenerateOptions ↔ OpenAI chat completions wire format. */
import { brandString } from '@mammoth-ai/mmp-brand'
import type {
  ContentBlock,
  FinishReason,
  GenerateOptions,
  StreamChunk,
  TokenUsage,
  ToolCallId,
  ToolSchema,
} from '@mammoth-ai/mmp-llm'
import { textOnlyImageText } from '@mammoth-ai/mmp-llm'

export type OpenAiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface GroundRequestImage {
  readonly mediaType: string
  readonly base64: string
}

type OpenAiMessageContent = string | OpenAiContentPart[] | null

type OpenAiMessage =
  | {
    role: 'system' | 'user' | 'assistant'
    content: OpenAiMessageContent
    tool_calls?: OpenAiToolCall[]
    reasoning_content?: string
  }
  | { role: 'tool'; tool_call_id: string; content: OpenAiMessageContent }

interface OpenAiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

function blockText(block: ContentBlock): string {
  switch (block.type) {
    case 'text':
      return block.text
    case 'reasoning':
      return ''
    case 'image':
      return textOnlyImageText(block.attachment)
    case 'file':
      return '[file omitted]'
    case 'tool-call':
      return ''
    case 'tool-addition':
    case 'tool-removal':
      return ''
    default:
      return ''
  }
}

function contentText(blocks: readonly ContentBlock[]): string {
  return blocks.map(blockText).filter(Boolean).join('\n')
}

function assistantReasoning(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: 'reasoning' }> => block.type === 'reasoning')
    .map(block => block.text)
    .filter(Boolean)
    .join('')
}

function assistantToolCalls(blocks: readonly ContentBlock[]): OpenAiToolCall[] {
  const out: OpenAiToolCall[] = []
  for (const block of blocks) {
    if (block.type !== 'tool-call') continue
    out.push({
      id: String(block.id),
      type: 'function',
      function: { name: block.name, arguments: block.arguments },
    })
  }
  return out
}

function stringDelta(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : ''
}

function encodedImage(block: ContentBlock, images: ReadonlyMap<string, GroundRequestImage> | undefined): GroundRequestImage | undefined {
  if (block.type !== 'image' || block.offloaded === true || images === undefined) return undefined
  return images.get(String(block.attachment.attachmentId))
}

function visualContent(blocks: readonly ContentBlock[], images: ReadonlyMap<string, GroundRequestImage>): OpenAiContentPart[] {
  const parts: OpenAiContentPart[] = []
  for (const block of blocks) {
    const image = encodedImage(block, images)
    if (image !== undefined) {
      parts.push({ type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.base64}` } })
      continue
    }
    const text = blockText(block)
    if (text) parts.push({ type: 'text', text })
  }
  if (!parts.some(part => part.type === 'text')) parts.unshift({ type: 'text', text: ' ' })
  return parts
}

function messageContent(
  blocks: readonly ContentBlock[],
  images: ReadonlyMap<string, GroundRequestImage> | undefined,
  empty: string,
): OpenAiMessageContent {
  if (images !== undefined && blocks.some(block => encodedImage(block, images) !== undefined)) {
    return visualContent(blocks, images)
  }
  return contentText(blocks) || empty
}

/** Project Harness request messages into OpenAI chat messages. */
export function toOpenAiMessages(
  options: GenerateOptions,
  images?: ReadonlyMap<string, GroundRequestImage>,
): OpenAiMessage[] {
  const out: OpenAiMessage[] = []
  if (options.system !== undefined && options.system.trim().length > 0) {
    out.push({ role: 'system', content: options.system })
  }
  for (const message of options.messages) {
    if (message.role === 'system' || message.role === 'developer') {
      const text = contentText(message.content)
      if (text) out.push({ role: 'system', content: text })
      continue
    }
    if (message.role === 'user') {
      out.push({ role: 'user', content: messageContent(message.content, images, ' ') })
      continue
    }
    if (message.role === 'assistant') {
      const toolCalls = assistantToolCalls(message.content)
      const text = contentText(message.content)
      const reasoning = assistantReasoning(message.content)
      // DeepSeek rejects assistant rows with content=null and no tool_calls
      // (common after a cancelled/thinking-only turn).
      const content = text.length > 0
        ? text
        : toolCalls.length > 0
          ? null
          : reasoning.length > 0 ? reasoning : ' '
      out.push({
        role: 'assistant',
        content,
        ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
        ...reasoning.length > 0 ? { reasoning_content: reasoning } : {},
      })
      continue
    }
    if (message.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: String(message.toolCallId),
        content: messageContent(message.content, images, message.isError === true ? 'error' : ''),
      })
    }
  }
  return out
}

export function toOpenAiTools(tools: readonly ToolSchema[] | undefined): unknown[] | undefined {
  if (tools === undefined || tools.length === 0) return undefined
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

export function mapUsage(raw: {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
} | null | undefined): TokenUsage | undefined {
  if (!raw) return undefined
  const inputTokens = Math.max(0, Math.floor(Number(raw.prompt_tokens ?? 0) || 0))
  const outputTokens = Math.max(0, Math.floor(Number(raw.completion_tokens ?? 0) || 0))
  let totalTokens = Math.max(0, Math.floor(Number(raw.total_tokens ?? 0) || 0))
  if (totalTokens <= 0) totalTokens = inputTokens + outputTokens
  if (inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0) return undefined
  return {
    inputTokens,
    outputTokens,
    ...totalTokens > 0 ? { totalTokens } : {},
  }
}

export function mapFinishReason(raw: string | null | undefined, hadTools: boolean): FinishReason {
  if (raw === 'tool_calls' || hadTools) return { kind: 'tool-calls' }
  if (raw === 'length') return { kind: 'max-tokens' }
  return { kind: 'stop' }
}

type OpenAiChoice = {
  delta?: {
    content?: string | null
    reasoning_content?: string | null
    tool_calls?: Array<{
      index?: number
      id?: string
      function?: { name?: string; arguments?: string }
    }>
  }
  finish_reason?: string | null
  message?: {
    content?: string | null
    reasoning_content?: string | null
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
  }
}

/** Incremental OpenAI SSE → Harness StreamChunk translator (reasoning + text + tool_calls + usage). */
export class OpenAiSseTranslator {
  private textIndex: number | undefined
  private text = ''
  private reasoningIndex: number | undefined
  private reasoning = ''
  private readonly toolByIndex = new Map<number, {
    id: string
    name: string
    arguments: string
    started: boolean
    blockIndex: number
  }>()
  private nextBlock = 0
  private finishReason: string | null = null
  private usage: TokenUsage | undefined
  private sawTool = false

  /**
   * Consume one SSE `data:` payload.
   * @param payload - JSON chunk or `[DONE]`.
   * @returns harness stream chunks for this payload.
   */
  pushData(payload: string): StreamChunk[] {
    if (!payload || payload === '[DONE]') return []
    let json: unknown
    try { json = JSON.parse(payload) }
    catch { return [] }
    if (!json || typeof json !== 'object') return []
    if ('error' in json && json.error && typeof json.error === 'object') {
      const message = 'message' in json.error && typeof json.error.message === 'string' ? json.error.message : 'Ground model stream interrupted; retry the request.'
      throw new LlmError(message, 'INVALID_REQUEST')
    }
    const obj = json as {
      choices?: OpenAiChoice[]
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }
    const out: StreamChunk[] = []
    const usage = mapUsage(obj.usage)
    if (usage) this.usage = usage

    const choice = obj.choices?.[0]
    if (!choice) return out

    if (choice.finish_reason) this.finishReason = choice.finish_reason

    const message = choice.message
    if (message) {
      out.push(...this.appendReasoning(stringDelta(message.reasoning_content)))
      out.push(...this.appendText(stringDelta(message.content)))
      if (message.tool_calls) {
        for (const [i, call] of message.tool_calls.entries()) {
          out.push(...this.appendTool(i, call.id, call.function.name, call.function.arguments, true))
        }
      }
    }

    const delta = choice.delta
    if (delta) {
      out.push(...this.appendReasoning(stringDelta(delta.reasoning_content)))
      out.push(...this.appendText(stringDelta(delta.content)))
      if (delta.tool_calls) {
        for (const call of delta.tool_calls) {
          const index = call.index ?? 0
          out.push(...this.appendTool(
            index,
            call.id,
            call.function?.name,
            call.function?.arguments,
            false,
          ))
        }
      }
    }
    return out
  }

  /**
   * Close open blocks and emit the terminal finish chunk.
   * @returns trailing block-end, usage, and finish chunks.
   */
  finish(): StreamChunk[] {
    const out: StreamChunk[] = []
    out.push(...this.closeReasoning())
    out.push(...this.closeText())
    for (const tool of [...this.toolByIndex.values()].sort((a, b) => a.blockIndex - b.blockIndex)) {
      if (!tool.started) continue
      out.push({
        type: 'block-end',
        index: tool.blockIndex,
        block: {
          type: 'tool-call',
          id: brandString<ToolCallId>(tool.id),
          name: tool.name,
          arguments: tool.arguments,
        },
      })
    }
    if (this.usage) out.push({ type: 'usage', usage: this.usage })
    out.push({
      type: 'finish',
      reason: mapFinishReason(this.finishReason, this.sawTool),
    })
    return out
  }

  private closeReasoning(): StreamChunk[] {
    if (this.reasoningIndex === undefined) return []
    const out: StreamChunk[] = [{
      type: 'block-end',
      index: this.reasoningIndex,
      block: { type: 'reasoning', text: this.reasoning },
    }]
    this.reasoningIndex = undefined
    return out
  }

  private closeText(): StreamChunk[] {
    if (this.textIndex === undefined) return []
    const out: StreamChunk[] = [{
      type: 'block-end',
      index: this.textIndex,
      block: { type: 'text', text: this.text },
    }]
    this.textIndex = undefined
    return out
  }

  private appendReasoning(piece: string): StreamChunk[] {
    if (!piece) return []
    const out: StreamChunk[] = this.closeText()
    if (this.reasoningIndex === undefined) {
      this.reasoningIndex = this.nextBlock++
      out.push({ type: 'block-start', index: this.reasoningIndex, blockType: 'reasoning' })
    }
    this.reasoning += piece
    out.push({ type: 'reasoning-delta', index: this.reasoningIndex, text: piece })
    return out
  }

  private appendText(piece: string): StreamChunk[] {
    if (!piece) return []
    const out: StreamChunk[] = this.closeReasoning()
    if (this.textIndex === undefined) {
      this.textIndex = this.nextBlock++
      out.push({ type: 'block-start', index: this.textIndex, blockType: 'text' })
    }
    this.text += piece
    out.push({ type: 'text-delta', index: this.textIndex, text: piece })
    return out
  }

  private appendTool(
    index: number,
    id: string | undefined,
    name: string | undefined,
    argsDelta: string | undefined,
    replaceArgs: boolean,
  ): StreamChunk[] {
    this.sawTool = true
    const out: StreamChunk[] = this.closeReasoning()
    let tool = this.toolByIndex.get(index)
    if (tool === undefined) {
      tool = {
        id: id || `call_${index}`,
        name: name || 'tool',
        arguments: '',
        started: false,
        blockIndex: this.nextBlock++,
      }
      this.toolByIndex.set(index, tool)
    } else {
      if (id) tool.id = id
      if (name) tool.name = name
    }
    if (!tool.started) {
      tool.started = true
      out.push({ type: 'block-start', index: tool.blockIndex, blockType: 'tool-call' })
    }
    const delta = argsDelta ?? ''
    if (replaceArgs) tool.arguments = delta
    else tool.arguments += delta
    if (delta.length > 0 || replaceArgs) {
      out.push({
        type: 'tool-call-delta',
        index: tool.blockIndex,
        id: brandString<ToolCallId>(tool.id),
        name: tool.name,
        argumentsDelta: replaceArgs ? tool.arguments : delta,
      })
    }
    return out
  }
}

export type { OpenAiMessage }
