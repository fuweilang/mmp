/** Composer selection over one cloud library. Chips wait; nothing here sends a prompt. */

export type LibraryKind = 'FILE' | 'FOLDER' | 'LINK'

export type LibraryChoice = {
  readonly nodeId: string
  readonly versionId: string | null
  readonly versionNo: number | null
  readonly name: string
  readonly kind: LibraryKind
  readonly parseStatus: string | null
  readonly parseReason: string | null
}

export type LibraryChip = {
  readonly nodeId: string
  readonly versionId: string
  readonly versionNo: number
  readonly name: string
}

export type LocalDraft = {
  readonly name: string
  readonly persisted: false
}

/** Why a visible row cannot be attached to the composer. */
export function choiceBlock(item: LibraryChoice): { disabled: boolean; reason: string | null } {
  if (item.kind !== 'FILE') return { disabled: true, reason: 'not-file' }
  if (item.parseStatus !== 'READY' || item.versionId == null || item.versionNo == null) {
    return { disabled: true, reason: item.parseReason ?? item.parseStatus ?? 'unavailable' }
  }
  return { disabled: false, reason: null }
}

/** Add one ready version. Duplicate versions stay once. This never marks the draft sent. */
export function addLibraryChip(current: readonly LibraryChip[], item: LibraryChoice): { chips: LibraryChip[]; sent: false } {
  const block = choiceBlock(item)
  if (block.disabled || item.versionId == null || item.versionNo == null) return { chips: [...current], sent: false }
  if (current.some(chip => chip.versionId === item.versionId)) return { chips: [...current], sent: false }
  return {
    chips: [...current, { nodeId: item.nodeId, versionId: item.versionId, versionNo: item.versionNo, name: item.name }],
    sent: false,
  }
}

/** A local file stays a draft until the user explicitly saves it. */
export function stageLocalFile(name: string): LocalDraft {
  return { name, persisted: false }
}

/** Stable reference id. The serializer refetches this version; it does not trust a model-written id. */
export function libraryRef(chip: Pick<LibraryChip, 'nodeId' | 'versionId'>): string {
  return `${chip.nodeId}@${chip.versionId}`
}

export function parseLibraryRef(ref: string): { nodeId: string; versionId: string } | null {
  const at = ref.lastIndexOf('@')
  if (at <= 0 || at === ref.length - 1) return null
  return { nodeId: ref.slice(0, at), versionId: ref.slice(at + 1) }
}

export type LibrarySourceQuote = {
  readonly name: string
  readonly versionId: string
  readonly locator: string
  readonly quote: string
}

/** Model text built only from quotes the library API returned. */
export function librarySourceText(source: LibrarySourceQuote): string {
  return [
    '<untrusted-library-data>',
    `[S1] ${source.name} ${source.versionId} ${source.locator}`,
    source.quote,
    '</untrusted-library-data>',
  ].join('\n')
}
