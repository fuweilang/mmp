/** Gateway body-byte fence for Ground chat completions. */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GROUND_CHAT_BODY_MAX_BYTES,
  estimateChatBodyTokens,
  fitChatCompletionsBody,
  fitChatCompletionsToTokenBudget,
  fitGroundChatCompletionsBody,
  jsonByteLength,
  resolveContextTokenBudget,
  resolveGroundChatBodyMaxBytes,
} from '../src/body-budget.ts'
import type { OpenAiMessage } from '../src/openai-map.ts'

function bigTool(n: number, id = 'c1'): OpenAiMessage {
  return { role: 'tool', tool_call_id: id, content: 'X'.repeat(n) }
}

describe('resolveGroundChatBodyMaxBytes', () => {
  it('defaults under the nginx 50mb align target', () => {
    expect(resolveGroundChatBodyMaxBytes({})).toBe(DEFAULT_GROUND_CHAT_BODY_MAX_BYTES)
    expect(DEFAULT_GROUND_CHAT_BODY_MAX_BYTES).toBeLessThanOrEqual(50 * 1024 * 1024)
  })

  it('accepts GROUND_CHAT_BODY_MAX_BYTES', () => {
    expect(resolveGroundChatBodyMaxBytes({ GROUND_CHAT_BODY_MAX_BYTES: '120000' })).toBe(120000)
    expect(resolveGroundChatBodyMaxBytes({ GROUND_CHAT_BODY_MAX_BYTES: 'nope' }))
      .toBe(DEFAULT_GROUND_CHAT_BODY_MAX_BYTES)
  })
})

describe('fitChatCompletionsBody', () => {
  it('returns the same body when already under budget', () => {
    const body = {
      model: 'm',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
      ] as OpenAiMessage[],
      stream: true,
    }
    const fitted = fitChatCompletionsBody(body, 10_000)
    expect(fitted.trimmed).toBe(false)
    expect(fitted.body).toEqual(body)
  })

  it('shrinks old tool results before dropping turns', () => {
    const messages: OpenAiMessage[] = [
      { role: 'system', content: 'keep-system' },
      { role: 'user', content: 'old' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run', arguments: '{}' } }],
      },
      bigTool(50_000),
      { role: 'user', content: 'latest ask' },
    ]
    const body = { model: 'm', messages, stream: true }
    const fitted = fitChatCompletionsBody(body, 8_000)
    expect(fitted.trimmed).toBe(true)
    expect(fitted.bytes).toBeLessThanOrEqual(8_000)
    expect(fitted.body.messages[0]).toEqual({ role: 'system', content: 'keep-system' })
    expect(fitted.body.messages.at(-1)).toEqual({ role: 'user', content: 'latest ask' })
    const tool = fitted.body.messages.find(message => message.role === 'tool')
    if (tool && tool.role === 'tool') {
      expect(tool.content.length).toBeLessThan(50_000)
      expect(tool.content).toContain('truncated for gateway body budget')
    }
  })

  it('drops oldest turns when shrinking is not enough', () => {
    const messages: OpenAiMessage[] = [{ role: 'system', content: 'sys' }]
    for (let i = 0; i < 20; i += 1) {
      messages.push({ role: 'user', content: `u${i}-${'Y'.repeat(2_000)}` })
      messages.push({ role: 'assistant', content: `a${i}-${'Z'.repeat(2_000)}` })
    }
    messages.push({ role: 'user', content: 'final-question' })
    const body = { model: 'm', messages, stream: true }
    const before = jsonByteLength(body)
    expect(before).toBeGreaterThan(20_000)
    const fitted = fitChatCompletionsBody(body, 12_000)
    expect(fitted.trimmed).toBe(true)
    expect(fitted.bytes).toBeLessThanOrEqual(12_000)
    expect(fitted.body.messages.some(message => message.role === 'system')).toBe(true)
    expect(fitted.body.messages.at(-1)).toMatchObject({ role: 'user', content: 'final-question' })
    expect(fitted.body.messages.length).toBeLessThan(messages.length)
  })
})

describe('fitChatCompletionsToTokenBudget', () => {
  it('shrinks under a model context token budget while keeping system + latest ask', () => {
    const messages: OpenAiMessage[] = [
      { role: 'system', content: 'keep-system' },
      { role: 'user', content: 'old' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run', arguments: '{}' } }],
      },
      bigTool(80_000),
      { role: 'user', content: 'latest ask' },
    ]
    const body = { model: 'm', messages, stream: true }
    const before = estimateChatBodyTokens(body)
    expect(before).toBeGreaterThan(5_000)
    const fitted = fitChatCompletionsToTokenBudget(body, 3_000)
    expect(fitted.trimmed).toBe(true)
    expect(fitted.tokens).toBeLessThanOrEqual(3_000)
    expect(fitted.body.messages[0]).toEqual({ role: 'system', content: 'keep-system' })
    expect(fitted.body.messages.at(-1)).toEqual({ role: 'user', content: 'latest ask' })
  })
})

describe('fitGroundChatCompletionsBody', () => {
  it('applies context-window fit then byte fence', () => {
    const messages: OpenAiMessage[] = [{ role: 'system', content: 'sys' }]
    for (let i = 0; i < 30; i += 1) {
      messages.push({ role: 'user', content: `u${i}-${'Y'.repeat(4_000)}` })
      messages.push({ role: 'assistant', content: `a${i}-${'Z'.repeat(4_000)}` })
    }
    messages.push({ role: 'user', content: 'final-question' })
    const body = { model: 'm', messages, stream: true }
    const fitted = fitGroundChatCompletionsBody(body, {
      contextWindow: 8_000,
      reservedCompletionTokens: 1_000,
      maxBytes: 50 * 1024 * 1024,
    })
    expect(fitted.trimmed).toBe(true)
    expect(fitted.tokens).toBeLessThanOrEqual(resolveContextTokenBudget(8_000, 1_000))
    expect(fitted.body.messages.some(message => message.role === 'system')).toBe(true)
    expect(fitted.body.messages.at(-1)).toMatchObject({ role: 'user', content: 'final-question' })
  })
})
