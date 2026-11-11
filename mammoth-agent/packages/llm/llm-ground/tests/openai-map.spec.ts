/** OpenAI SSE mapping, including DeepSeek reasoning_content. */
import { describe, expect, it } from 'vitest'
import type { ContentBlock, GenerateOptions, ToolSchema } from '@mammoth-ai/mmp-llm'
import { ToolCallId } from '@mammoth-ai/mmp-llm'
import type { FileAttachmentRef, ImageAttachmentRef } from '@mammoth-ai/mmp-attachment'
import {
  mapFinishReason,
  mapUsage,
  OpenAiSseTranslator,
  toOpenAiMessages,
  toOpenAiTools,
} from '../src/openai-map.ts'

const image = {
  type: 'image' as const,
  attachment: { attachmentId: 'sha256:abcdef0123456789ffff' } as ImageAttachmentRef,
}
const file = { type: 'file' as const, attachment: {} as FileAttachmentRef }

function options(messages: GenerateOptions['messages'] | readonly object[], extra?: Partial<GenerateOptions>): GenerateOptions {
  return { provider: 'mammoth-ground', model: 'deepseek-flash', messages: messages as GenerateOptions['messages'], ...extra }
}

describe('toOpenAiMessages', () => {
  it('sends a pasted image as an OpenAI image part', () => {
    const messages = toOpenAiMessages(options([
      { role: 'user', content: [{ type: 'text', text: '描述这张图' }, image] },
    ]), new Map([[image.attachment.attachmentId, { mediaType: 'image/jpeg', base64: 'aW1n' }]]))
    expect(messages).toEqual([{
      role: 'user',
      content: [
        { type: 'text', text: '描述这张图' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,aW1n' } },
      ],
    }])
  })

  it('projects system, user, assistant reasoning, tools, and omitted attachments', () => {
    expect(toOpenAiMessages(options([
      { role: 'system', content: [{ type: 'text', text: 'sys' }] },
      { role: 'developer', content: [{ type: 'text', text: 'dev' }] },
      { role: 'user', content: [
        { type: 'text', text: 'hi' },
        image,
        file,
        { type: 'tool-addition', toolName: 'x' },
        { type: 'tool-removal', toolName: 'x' },
        { type: 'unknown' } as unknown as ContentBlock,
      ] },
      { role: 'assistant', content: [
        { type: 'reasoning', text: 'think' },
        { type: 'text', text: 'ok' },
        { type: 'tool-call', id: ToolCallId('c1'), name: 'run', arguments: '{}' },
      ] },
      { role: 'tool', toolCallId: ToolCallId('c1'), content: [{ type: 'text', text: 'done' }] },
      { role: 'tool', toolCallId: ToolCallId('c2'), isError: true, content: [] },
    ], { system: 'root' }))).toEqual([
      { role: 'system', content: 'root' },
      { role: 'system', content: 'sys' },
      { role: 'system', content: 'dev' },
      { role: 'user', content: expect.stringContaining('hi') },
      {
        role: 'assistant',
        content: 'ok',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run', arguments: '{}' } }],
        reasoning_content: 'think',
      },
      { role: 'tool', tool_call_id: 'c1', content: 'done' },
      { role: 'tool', tool_call_id: 'c2', content: 'error' },
    ])
  })

  it('uses a blank user placeholder and never sends assistant content=null without tools', () => {
    expect(toOpenAiMessages(options([
      { role: 'developer', content: [{ type: 'reasoning', text: 'hidden' }] },
      { role: 'user', content: [] },
      { role: 'assistant', content: [{ type: 'reasoning', text: '' }] },
      { role: 'assistant', content: [{ type: 'reasoning', text: 'only think' }] },
    ]))).toEqual([
      { role: 'user', content: ' ' },
      { role: 'assistant', content: ' ' },
      { role: 'assistant', content: 'only think', reasoning_content: 'only think' },
    ])
  })
})

describe('toOpenAiTools / usage / finish', () => {
  it('omits empty tool lists', () => {
    expect(toOpenAiTools(undefined)).toBeUndefined()
    expect(toOpenAiTools([])).toBeUndefined()
    expect(toOpenAiTools([{ name: 'a', description: 'd', parameters: { type: 'object' } }] as ToolSchema[]))
      .toEqual([{ type: 'function', function: { name: 'a', description: 'd', parameters: { type: 'object' } } }])
  })

  it('maps usage and finish reasons', () => {
    expect(mapUsage(undefined)).toBeUndefined()
    expect(mapUsage({})).toBeUndefined()
    expect(mapUsage({ prompt_tokens: 1, completion_tokens: 2 })).toEqual({
      inputTokens: 1, outputTokens: 2, totalTokens: 3,
    })
    expect(mapUsage({ prompt_tokens: 1, completion_tokens: 2, total_tokens: 9 }))
      .toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 9 })
    expect(mapFinishReason('tool_calls', false)).toEqual({ kind: 'tool-calls' })
    expect(mapFinishReason('stop', true)).toEqual({ kind: 'tool-calls' })
    expect(mapFinishReason('length', false)).toEqual({ kind: 'max-tokens' })
    expect(mapFinishReason(null, false)).toEqual({ kind: 'stop' })
  })
})

describe('OpenAiSseTranslator', () => {
  it('ignores empty, done, and malformed payloads', () => {
    const t = new OpenAiSseTranslator()
    expect(t.pushData('')).toEqual([])
    expect(t.pushData('[DONE]')).toEqual([])
    expect(t.pushData('not-json')).toEqual([])
    expect(t.pushData('null')).toEqual([])
    expect(t.pushData('[]')).toEqual([])
    expect(t.pushData('{"choices":[]}')).toEqual([])
  })

  it('streams DeepSeek reasoning_content then visible content', () => {
    const t = new OpenAiSseTranslator()
    expect(t.pushData(JSON.stringify({
      choices: [{ delta: { content: null, reasoning_content: '' } }],
    }))).toEqual([])
    expect(t.pushData(JSON.stringify({
      choices: [{ delta: { content: null, reasoning_content: '想' } }],
    }))).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: '想' },
    ])
    expect(t.pushData(JSON.stringify({
      choices: [{ delta: { content: '好', reasoning_content: null }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    }))).toEqual([
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: '想' } },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: '好' },
    ])
    expect(t.finish()).toEqual([
      { type: 'block-end', index: 1, block: { type: 'text', text: '好' } },
      { type: 'usage', usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  it('closes reasoning before tools and accepts non-stream message payloads', () => {
    const t = new OpenAiSseTranslator()
    t.pushData(JSON.stringify({ choices: [{ delta: { reasoning_content: 'plan' } }] }))
    expect(t.pushData(JSON.stringify({
      choices: [{
        message: {
          reasoning_content: ' extra',
          content: '',
          tool_calls: [{ id: 't1', function: { name: 'run', arguments: '{"a":1}' } }],
        },
        finish_reason: 'tool_calls',
      }],
    }))).toEqual([
      { type: 'reasoning-delta', index: 0, text: ' extra' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'plan extra' } },
      { type: 'block-start', index: 1, blockType: 'tool-call' },
      {
        type: 'tool-call-delta',
        index: 1,
        id: 't1',
        name: 'run',
        argumentsDelta: '{"a":1}',
      },
    ])
    const streamed = new OpenAiSseTranslator()
    streamed.pushData(JSON.stringify({
      choices: [{ delta: { tool_calls: [{ function: { arguments: '{' } }] } }],
    }))
    streamed.pushData(JSON.stringify({
      choices: [{ delta: { tool_calls: [{ id: 'x', function: { name: 'f', arguments: '}' } }] } }],
    }))
    expect(streamed.finish()[0]).toMatchObject({
      type: 'block-end',
      block: { type: 'tool-call', name: 'f', arguments: '{}' },
    })
  })

  it('finishes with max-tokens when only reasoning arrived', () => {
    const t = new OpenAiSseTranslator()
    t.pushData(JSON.stringify({
      choices: [{ delta: { reasoning_content: '…' }, finish_reason: 'length' }],
    }))
    expect(t.finish()).toEqual([
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: '…' } },
      { type: 'finish', reason: { kind: 'max-tokens' } },
    ])
  })
})
