/** One image's prompt budget. Pixels are not billed or fitted as base64 text. */
export const IMAGE_INPUT_TOKENS = 4_096

function isImagePart(value: unknown): value is { type: 'image_url' } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const part = value as { type?: unknown; image_url?: unknown }
  return part.type === 'image_url' && part.image_url !== undefined
}

/**
 * Prompt-token estimate for a chat body.
 * Text still uses the JSON character density. Each image counts as {@link IMAGE_INPUT_TOKENS}.
 * @param messages - OpenAI `messages`, including `image_url` parts.
 * @param tools - optional tool schemas; included only for the billing hold.
 */
export function estimateInputTokens(messages: unknown, tools?: unknown): number {
  let images = 0
  const measured = JSON.stringify(messages ?? [], (_key, value) => {
    if (!isImagePart(value)) return value
    images += 1
    return { type: 'image_url' }
  })
  const toolsText = tools === undefined ? '' : JSON.stringify(tools)
  return Math.ceil((measured.length + toolsText.length) / 2) + images * IMAGE_INPUT_TOKENS
}

/** Whether the estimated prompt plus reserved completion fits one context window. */
export function promptFitsContext(messages: unknown, maxTokens: number, contextWindow: number): boolean {
  if (!Number.isFinite(maxTokens) || !Number.isFinite(contextWindow)) return true
  return estimateInputTokens(messages) + maxTokens <= contextWindow
}
