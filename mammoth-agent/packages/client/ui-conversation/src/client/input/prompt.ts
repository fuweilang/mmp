/** Serialize semantic draft spans without turning quoted references into gestures. */
import { formatQuoteText } from '@mammoth-ai/mmp-client-ui-primitives'
import type { DraftSnapshot } from '../contract/draft-editor.ts'
import type { LibraryPromptPart, SerializedDraftPrompt, SerializedReference } from '../contract/input.ts'

type DraftToken = { readonly kind: 'text'; text: string } | { readonly kind: 'quote'; readonly text: string }
  | { readonly kind: 'reference'; readonly part: LibraryPromptPart }
interface DraftSpan {
  readonly offset: number
  readonly length: number
  readonly token: DraftToken
}

const QUOTE_SEPARATOR = '\n\n'

function pushText(tokens: DraftToken[], text: string): void {
  if (text === '') return
  const last = tokens.at(-1)
  if (last?.kind === 'text') last.text += text
  else tokens.push({ kind: 'text', text })
}

function normalizeQuoteBoundaries(tokens: DraftToken[]): DraftToken[] {
  const normalized: DraftToken[] = []
  for (const token of tokens) {
    if (token.kind === 'reference') {
      normalized.push(token)
      continue
    }
    if (token.kind === 'text') {
      pushText(normalized, token.text)
      continue
    }
    const previous = normalized.at(-1)
    if (previous?.kind === 'text') {
      previous.text = previous.text.trimEnd()
      if (previous.text !== '') previous.text += QUOTE_SEPARATOR
      else normalized.pop()
    }
    if (normalized.at(-1)?.kind === 'quote') {
      normalized.push({ kind: 'text', text: QUOTE_SEPARATOR })
    }
    normalized.push(token)
  }
  for (let index = 0; index < normalized.length; index++) {
    const token = normalized[index]
    if (token?.kind !== 'quote') continue
    const next = normalized[index + 1]
    if (next?.kind !== 'text') continue
    if (next.text === QUOTE_SEPARATOR && normalized[index + 2]?.kind === 'quote') continue
    next.text = next.text.trimStart()
    if (next.text !== '') next.text = `${QUOTE_SEPARATOR}${next.text}`
  }
  return normalized.filter(token => token.kind !== 'text' || token.text !== '')
}

/**
 * Serialize the captured draft through reference codecs, formatting quotes as Markdown.
 * @param draft - one semantic draft revision.
 * @param serializeReference - owner-routed reference serializer.
 * @returns synchronous content without references, otherwise the resolving promise.
 */
export function serializeDraftPrompt(
  draft: DraftSnapshot,
  serializeReference: (source: string, ref: string) => Promise<SerializedReference>,
): string | Promise<SerializedDraftPrompt> {
  const build = (references: readonly DraftSpan[]): SerializedDraftPrompt => {
    const spans = [
      ...references,
      ...(draft.quotes ?? []).map(quote => ({ offset: quote.offset, length: quote.length,
        token: { kind: 'quote' as const, text: quote.text } })),
    ].sort((a, b) => a.offset - b.offset)
    const tokens: DraftToken[] = []
    let cursor = 0
    for (const span of spans) {
      pushText(tokens, draft.text.slice(cursor, span.offset))
      if (span.token.kind === 'text') pushText(tokens, span.token.text)
      else tokens.push(span.token)
      cursor = span.offset + span.length
    }
    pushText(tokens, draft.text.slice(cursor))
    const first = tokens[0]
    if (first?.kind === 'text') first.text = first.text.trimStart()
    const last = tokens.at(-1)
    if (last?.kind === 'text') last.text = last.text.trimEnd()
    const normalized = normalizeQuoteBoundaries(tokens)
    if (!normalized.some(token => token.kind === 'reference')) {
      return normalized.map(token => token.kind === 'quote' ? formatQuoteText(token.text) : token.kind === 'text' ? token.text : '').join('')
    }
    const parts: Exclude<SerializedDraftPrompt, string>[number][] = []
    for (const token of normalized) {
      if (token.kind === 'reference') { parts.push(token.part); continue }
      const text = token.kind === 'quote' ? formatQuoteText(token.text) : token.text
      const last = parts.at(-1)
      if (last?.type === 'text') parts[parts.length - 1] = { type: 'text', text: last.text + text }
      else parts.push({ type: 'text', text })
    }
    return parts
  }
  if (draft.references.length === 0) return build([]) as string
  return Promise.all(draft.references.map(async (reference): Promise<DraftSpan> => {
    const value = await serializeReference(reference.source, reference.ref)
    return { offset: reference.offset, length: reference.length, token: typeof value === 'string'
      ? { kind: 'text', text: value } : { kind: 'reference', part: { ...value, name: reference.label } } }
  })).then(build)
}
