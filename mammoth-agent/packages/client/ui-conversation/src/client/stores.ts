/** Per-session Conversation store shared by the shell body and header. */
import { defineStore, type EngineStoreHandle } from '@mammoth-ai/mmp-client-store'
import type { SessionId } from '@mammoth-ai/mmp-session/types'
import type { ConversationStoreState } from './contract/views.ts'
import type { CatalogDraftSelection, DraftInput, DraftSnapshot } from './contract/draft-editor.ts'
import { parseStoredDraft } from './draft.ts'

const CONVERSATION_STORE_KEY = 'mmp.conversation'

/** Declared write set for the Conversation shell. */
type ConversationActions = {
  setDraft: (draft: ConversationStoreState, text: DraftInput) => void
  setView: (draft: ConversationStoreState, view: string) => void
  openView: (draft: ConversationStoreState, view: string, focus: string) => void
  completeViewRequest: (draft: ConversationStoreState) => void
}

/**
 * Declare per-session draft persistence and View selection.
 * @returns the store handle.
 */
export function createConversationStore(): EngineStoreHandle<ConversationStoreState, ConversationActions> {
  return defineStore({
    init: (): ConversationStoreState => ({ draft: '', view: null, viewRequest: null }),
    persist: CONVERSATION_STORE_KEY,
    actions: {
      setDraft: (d, text: DraftInput) => { d.draft = text },
      setView: (d, view: string) => { d.view = view },
      openView: (d, view: string, focus: string) => {
        d.view = view
        d.viewRequest = { view, focus }
      },
      completeViewRequest: (d) => { d.viewRequest = null },
    },
  })
}

/**
 * Read a Session's draft before its input source is published to React.
 * @param sessionId - Session-scoped persistence suffix.
 * @returns saved semantic content, or an empty document when storage is absent or invalid.
 */
export function readConversationDraft(sessionId: SessionId): DraftSnapshot {
  const empty: DraftSnapshot = { text: '', references: [] }
  if (typeof localStorage === 'undefined') return empty
  try {
    const raw = localStorage.getItem(`${CONVERSATION_STORE_KEY}.${sessionId}`)
    if (raw === null) return empty
    const stored: unknown = JSON.parse(raw)
    if (typeof stored !== 'object' || stored === null || !('draft' in stored)) return empty
    return parseStoredDraft(stored.draft) ?? empty
  } catch (_error: unknown) {
    // Unavailable browser storage or malformed JSON has no usable saved draft.
    return empty
  }
}

/**
 * Replace only the saved expert and skills. Typed text and the selected view stay.
 * @param sessionId - Session-scoped persistence suffix.
 * @param selection - explicit empty selection New Task leaves behind.
 */
export function writeConversationDraftCatalog(sessionId: SessionId, selection: CatalogDraftSelection): void {
  if (typeof localStorage === 'undefined') return
  const key = `${CONVERSATION_STORE_KEY}.${sessionId}`
  try {
    const raw = localStorage.getItem(key)
    const stored: unknown = raw === null ? { view: null, viewRequest: null } : JSON.parse(raw)
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return
    const record = stored as { draft?: unknown }
    const draft = record.draft
    if (typeof draft === 'string') record.draft = { text: draft, references: [], catalogSelection: selection }
    else if (typeof draft === 'object' && draft !== null) record.draft = { ...draft, catalogSelection: selection }
    else record.draft = { text: '', references: [], catalogSelection: selection }
    localStorage.setItem(key, JSON.stringify(stored))
  } catch (_error: unknown) {
    // Storage failures leave the in-memory clear in place.
  }
}

/**
 * Read the persisted View preference before the Slot store is materialized.
 * @param sessionId - Session-scoped persistence suffix.
 * @returns the preferred View id, or null when storage has no usable value.
 */
export function readConversationViewPreference(sessionId: SessionId): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${CONVERSATION_STORE_KEY}.${sessionId}`)
    if (raw === null) return null
    const stored: unknown = JSON.parse(raw)
    if (typeof stored !== 'object' || stored === null || !('view' in stored)) return null
    return typeof stored.view === 'string' ? stored.view : null
  } catch {
    return null
  }
}
