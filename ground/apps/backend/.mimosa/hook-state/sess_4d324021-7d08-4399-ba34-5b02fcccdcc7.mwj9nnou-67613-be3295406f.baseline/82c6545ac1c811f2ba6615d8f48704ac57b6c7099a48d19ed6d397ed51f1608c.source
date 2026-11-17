import assert from 'node:assert/strict'
import { test } from 'node:test'
import { estimateInputTokens, IMAGE_INPUT_TOKENS, promptFitsContext } from '../../src/llm/prompt-tokens'

const text = [{ role: 'user', content: '描述一下' }]

test('text prompts keep the character-density estimate', () => {
  const tools = [{ type: 'function', name: 'bash' }]
  assert.equal(estimateInputTokens(text), Math.ceil(JSON.stringify(text).length / 2))
  assert.equal(
    estimateInputTokens(text, tools),
    Math.ceil((JSON.stringify(text).length + JSON.stringify(tools).length) / 2),
  )
})

test('a pasted photo fits a 128k window instead of counting its base64 as text', () => {
  const photo = [{
    role: 'user',
    content: [
      { type: 'text', text: '这是一张什么图片？' },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${'A'.repeat(400_000)}` } },
    ],
  }]
  assert.ok(Math.ceil(JSON.stringify(photo).length / 2) + 8192 > 128_000)
  assert.equal(estimateInputTokens(photo) < 20_000, true)
  assert.equal(promptFitsContext(photo, 8192, 128_000), true)
  const again = {
    role: 'user',
    content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,QQ' } }],
  }
  const placeholders = [
    { role: 'user', content: [{ type: 'image_url' }] },
    { role: 'user', content: [{ type: 'image_url' }] },
  ]
  assert.equal(
    estimateInputTokens([again, again]),
    Math.ceil(JSON.stringify(placeholders).length / 2) + IMAGE_INPUT_TOKENS * 2,
  )
  assert.equal(promptFitsContext([{ role: 'user', content: '字'.repeat(300_000) }], 8192, 128_000), false)
})
