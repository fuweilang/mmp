/** Replace one owner's chips without rewriting user text or other semantic draft spans. */
import type { DraftSnapshot, ReferenceInsert } from '../contract/draft-editor.ts'

/**
 * Build an atomic draft replacement for one source's complete selection.
 * @param draft - the current semantic document.
 * @param source - owner whose reference occurrences are removed.
 * @param references - complete replacement in selection order.
 * @returns a document preserving all unrelated chips, quotes and draft options.
 */
export function replaceSourceReferences(draft: DraftSnapshot, source: string, references: readonly ReferenceInsert[]): DraftSnapshot {
  const removed = draft.references.filter(ref => ref.source === source)
  const offsetOf = (offset: number) => offset - removed.reduce((sum, ref) => sum + (ref.offset < offset ? ref.length : 0), 0)
  let cursor = 0
  let text = ''
  for (const ref of removed) {
    text += draft.text.slice(cursor, ref.offset)
    cursor = ref.offset + ref.length
  }
  text += draft.text.slice(cursor)
  const kept = draft.references.filter(ref => ref.source !== source).map(ref => ({ ...ref, offset: offsetOf(ref.offset) }))
  for (const ref of references) {
    if (text !== '' && !/\s$/u.test(text)) text += ' '
    kept.push({ ...ref, offset: text.length, length: ref.clipboardText.length })
    text += `${ref.clipboardText} `
  }
  return { ...draft, text, references: kept,
    ...(draft.quotes === undefined ? {} : { quotes: draft.quotes.map(quote => ({ ...quote, offset: offsetOf(quote.offset) })) }),
  }
}
