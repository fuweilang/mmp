/** Ground gateway adapter configuration. */
import z from '@mammoth-ai/schemastery'

export interface Config {
  /** Ground public origin (no path), e.g. http://127.0.0.1:5201 */
  groundOrigin: string
  /** Provider route id registered with ctx.llm */
  providerId: string
  /** Display name in model picker */
  displayName: string
  /** Interval for observing the cloud model pool; zero disables background refresh. */
  catalogPollIntervalMs?: number
}

export const Config: z<Config> = z.object({
  groundOrigin: z.string().default('http://127.0.0.1:5201'),
  providerId: z.string().default('mammoth-ground'),
  displayName: z.string().default('猛犸云端'),
  catalogPollIntervalMs: z.number().min(0).default(15000),
})

export function resolveGroundOrigin(raw: string): string {
  const url = new URL(raw.trim() || 'http://127.0.0.1:5201')
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('llm-ground: groundOrigin must be http(s)')
  }
  return url.origin
}

export function chatCompletionsUrl(origin: string): string {
  return new URL('/api/v1/chat/completions', origin).href
}

export function modelsUrl(origin: string): string {
  return new URL('/api/v1/models', origin).href
}
