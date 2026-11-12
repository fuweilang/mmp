/** Client-owned observation of the optional Desktop preload. */
import { createSnapshotStore } from '@mammoth-ai/mmp-client-store'
import type { DesktopUpdateBridge, DesktopUpdateView } from '../types.ts'

/** Owns one preload subscription across both sidebar locations. */
export class DesktopUpdateSource {
  /** Framework-observed carrier status shared by both sidebar controls. */
  readonly store = createSnapshotStore<DesktopUpdateView>({ failed: false, opening: false })
  private live = true
  private received = false
  private readonly unsubscribe: (() => void) | undefined

  /** @param bridge - Optional isolated Electron API, absent in ordinary browsers. */
  constructor(private readonly bridge: DesktopUpdateBridge | undefined) {
    if (typeof bridge?.command === 'function') this.store.set({ failed: false, opening: false, managed: true })
    this.unsubscribe = bridge?.subscribe((presentation) => {
      if (!this.live) return
      this.received = true
      this.store.set({ ...this.store.getSnapshot(), presentation, failed: false })
    })
    void bridge?.status().then((presentation) => {
      if (this.live && !this.received) this.store.set({ ...this.store.getSnapshot(), presentation })
    }, () => {
      if (this.live && !this.received) this.store.set({ ...this.store.getSnapshot(), failed: true })
    })
  }

  /** Invoke one user action; subsequent clicks join the shell-owned operation. */
  open(): void {
    if (!this.live || this.bridge === undefined) return
    const state = this.store.getSnapshot()
    if (state.opening || (state.presentation !== undefined
      && ['checking', 'downloading', 'verifying', 'installing'].includes(state.presentation.phase))) return
    this.store.set({ ...state, opening: true })
    void this.bridge.open().catch(() => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), failed: true })
    }).finally(() => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), opening: false })
    })
  }

  /**
   * Run one explicit stage, shared across all settings entry points.
   * @param action Check, download, or install; none implies the next stage.
   */
  command(action: 'check' | 'download' | 'install'): void {
    if (!this.live || this.bridge?.command === undefined) return
    const state = this.store.getSnapshot()
    if (state.opening || (state.presentation !== undefined
      && ['checking', 'downloading', 'verifying', 'installing'].includes(state.presentation.phase))) return
    this.received = true // an initial status response cannot overwrite a newer gesture
    this.store.set({ ...state, failed: false, opening: true, operation: action })
    void this.bridge.command(action).then((presentation) => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), presentation, failed: false })
    }, () => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), failed: true })
    }).finally(() => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), opening: false })
    })
  }

  /** Detach the carrier and ignore any pending status or action completion. */
  dispose(): void { this.live = false; this.unsubscribe?.() }
}
