/** User-facing projections of durable source text blocks. @module */
import type { LibrarySourceReference } from '@mammoth-ai/mmp-attachment/types'

/**
 * Recognize complete library metadata read from durable content.
 * @param value - untrusted stored metadata.
 * @returns whether the metadata safely identifies the saved file version.
 */
export function isLibrarySourceReference(value: unknown): value is LibrarySourceReference {
  if (typeof value !== 'object' || value === null) return false
  if (!('source' in value) || value.source !== 'library') return false
  if (!('nodeId' in value) || typeof value.nodeId !== 'string' || value.nodeId.trim() === '') return false
  if (!('versionId' in value) || typeof value.versionId !== 'string' || value.versionId.trim() === '') return false
  if (!('name' in value) || typeof value.name !== 'string' || value.name.trim() === '') return false
  if ('versionNo' in value && value.versionNo !== undefined
    && (typeof value.versionNo !== 'number' || !Number.isSafeInteger(value.versionNo) || value.versionNo < 1)) return false
  if ('bytes' in value && value.bytes !== undefined
    && (typeof value.bytes !== 'number' || !Number.isSafeInteger(value.bytes) || value.bytes < 0)) return false
  return true
}

/**
 * Address the exact version selected when a library reference was sent.
 * @param reference - saved source identity.
 * @returns an authenticated source route without credentials.
 */
export function librarySourceUrl(reference: LibrarySourceReference): string {
  return `/ground-library/nodes/${encodeURIComponent(reference.nodeId)}/source?versionId=${encodeURIComponent(reference.versionId)}`
}

/** Model-only trailer appended after an enterprise-knowledge retrieval. */
const KNOWLEDGE_TRAILER = '\n\n【企业知识库】'

/**
 * Keep the question from one stored prompt block. The trailer stays in the log for the model.
 * @param text - one durable text block.
 * @returns the text a person should see.
 */
export function userVisibleText(text: string): string {
  const at = text.indexOf(KNOWLEDGE_TRAILER)
  return at === -1 ? text : text.slice(0, at)
}

/**
 * Project source blocks as file links and retain the original ordinary text.
 * @param content - durable message blocks, including unknown legacy values.
 * @returns copyable user content without recognized source excerpts.
 */
export function userContentText(content: readonly unknown[]): string {
  const parts: string[] = []
  let text = ''
  for (const block of content) {
    if (typeof block !== 'object' || block === null || !('type' in block) || block.type !== 'text'
      || !('text' in block) || typeof block.text !== 'string') continue
    if ('reference' in block && isLibrarySourceReference(block.reference)) {
      if (text !== '') parts.push(text)
      text = ''
      const name = block.reference.name.replace(/\s+/gu, ' ').replace(/[\\[\]]/gu, '\\$&')
      parts.push(`[${name}](${librarySourceUrl(block.reference)})`)
    } else text += userVisibleText(block.text)
  }
  if (text !== '') parts.push(text)
  return parts.join('\n\n')
}
