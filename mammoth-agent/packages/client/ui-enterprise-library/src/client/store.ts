import { addLibraryChip, type LibraryChip, type LibraryChoice } from './selection.ts'

/** Session-scoped chips. Adding a chip does not submit the composer. */
export function createChipStore() {
  const chips = new Map<string, readonly LibraryChip[]>()
  const listeners = new Set<() => void>()
  const publish = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    get(sessionId: string): readonly LibraryChip[] {
      return chips.get(sessionId) ?? []
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    add(sessionId: string, item: LibraryChoice): { sent: false } {
      const next = addLibraryChip(chips.get(sessionId) ?? [], item)
      chips.set(sessionId, next.chips)
      publish()
      return { sent: next.sent }
    },
    remove(sessionId: string, versionId: string): void {
      chips.set(sessionId, (chips.get(sessionId) ?? []).filter(chip => chip.versionId !== versionId))
      publish()
    },
  }
}

export type ChipStore = ReturnType<typeof createChipStore>
