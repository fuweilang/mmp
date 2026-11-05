import { createSnapshotStore, type SnapshotStore } from '@mammoth-ai/mmp-client-store'

/** Remember the dismissed creation notice across sessions in this browser.
 * @returns a plugin-owned preference; unavailable storage only disables persistence.
 */
export function createCreationInfoStore(): SnapshotStore<boolean> {
  return createSnapshotStore(false, { persist: { name: 'mmp.creation-recommendations.info-dismissed' } })
}
