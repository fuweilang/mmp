import type { DesktopFileActions } from '@mammoth-ai/mmp-client-ui-file-actions/types'
/** Typed preload operations exposed only by the Electron shell. */

import type { DesktopKeyboardApi, DesktopShortcutsApi } from '@mammoth-ai/mmp-client-shortcuts/protocol'
import type { IpcMainInvokeEvent } from 'electron'
import type { DesktopBrowserBridge } from '@mammoth-ai/mmp-client-ui-sidebar-browser/types'
import type { DesktopFileDrag } from '@mammoth-ai/mmp-util-file-drag'

/** IPC channel names kept private to the desktop application bundle. */
export const DESKTOP_IPC = {
  fileSave: 'mmp-desktop:file-save',
  clipboardImageRead: 'mmp-desktop:clipboard-image-read',
  shortcutsInput: 'mmp-desktop:shortcuts-input',
  shortcutsCloseWindow: 'mmp-desktop:shortcuts-close-window',
  shortcutsGet: 'mmp-desktop:shortcuts-get',
  shortcutsEdit: 'mmp-desktop:shortcuts-edit',
  shortcutsChanged: 'mmp-desktop:shortcuts-changed',
  shortcutsRecording: 'mmp-desktop:shortcuts-recording',
  boot: 'mmp-desktop:boot',
  enterWorkspace: 'mmp-desktop:enter-workspace',
  onboardingActive: 'mmp-desktop:onboarding-active',
  onboardingApiKey: 'mmp-desktop:onboarding-api-key',
  bootFailed: 'mmp-desktop:boot-failed',
  browserAcquire: 'mmp-desktop:browser-acquire',
  browserRelease: 'mmp-desktop:browser-release',
  browserOpenRequested: 'mmp-desktop:browser-open-requested',
  directoryPick: 'mmp-desktop:directory-pick',
  fileDragPrepare: 'mmp-desktop:file-drag-prepare',
  fileDragCancel: 'mmp-desktop:file-drag-cancel',
  fileDragStart: 'mmp-desktop:file-drag-start',
  fileDragRelease: 'mmp-desktop:file-drag-release',
  deviceInfo: 'mmp-desktop:device-info',
  localeBootstrap: 'mmp-desktop:locale-bootstrap',
  localeChanged: 'mmp-desktop:locale-changed',
  updatesStatus: 'mmp-desktop:updates-status',
  updatesOpen: 'mmp-desktop:updates-open',
  updatesCommand: 'mmp-desktop:updates-command',
  updatesPresentation: 'mmp-desktop:updates-presentation',
  nativeThemeSet: 'mmp-desktop:native-theme-set',
  windowFullscreen: 'mmp-desktop:window-fullscreen',
  windowsAppearance: 'mmp-desktop:windows-appearance',
  windowsMenu: 'mmp-desktop:windows-menu',
} as const

/** Desktop release update state rendered by desktop-owned UI. */
export type DesktopUpdatePreparationFailureKind = 'stop-failed' | 'tasks-changed' | 'tasks-unavailable' | 'fullscreen-timeout'

export interface DesktopUpdateState {
  readonly phase: 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error'
  readonly version?: string
  readonly message?: string
  /** Main-owned diagnostics without subprocess output or credentials; hidden until expanded. */
  readonly technicalDetails?: string
  readonly percent?: number
  readonly failedOperation?: 'check' | 'download' | 'install'
  /** Main-owned preparation cause; UI wording is selected by the active locale. */
  readonly preparationFailure?: DesktopUpdatePreparationFailureKind
}

/** Classified failure copy selected by the Web locale without exposing raw updater diagnostics. */
export type DesktopUpdateFailureKind =
  | 'check'
  | 'check-network'
  | 'download'
  | 'download-network'
  | 'install'
  | 'install-network'
  | 'stop-failed'
  | 'tasks-changed'
  | 'tasks-unavailable'
  | 'fullscreen-timeout'

/** Semantic status content; actions open main-process confirmation dialogs only. */
export interface DesktopUpdatePresentation {
  readonly phase: DesktopUpdateState['phase']
  readonly version?: string
  readonly currentVersion?: string
  readonly supported?: boolean
  readonly checked?: boolean
  readonly releaseNotes?: string
  readonly percent?: number
  readonly failure?: DesktopUpdateFailureKind
}

/** Product documents cannot supply update versions, package URLs, or installation authorization. */
export interface MmpDesktopProductApi {
  readonly fileActions: DesktopFileActions
  readonly protocolVersion: 1
  readonly browser: DesktopBrowserBridge
  readonly fileDrag: DesktopFileDrag
  readonly keyboard: DesktopKeyboardApi
  readonly shortcuts: DesktopShortcutsApi
  /**
   * Local machine description for the feedback questionnaire.
   * @returns `name=value` fields separated by `; `, with no hostname, user name, or serial number.
   */
  deviceInfo(): Promise<string>
  readonly updates: {
    status(): Promise<DesktopUpdatePresentation>
    open(): Promise<void>
    command?(action: 'check' | 'download' | 'install'): Promise<DesktopUpdatePresentation>
    subscribe(listener: (state: DesktopUpdatePresentation) => void): () => void
  }
}

/** Scheme of Desktop-owned application documents. */
export const SCHEME = 'mmp-app'

/**
 * Reject IPC outside the allowed Desktop document origins.
 * @param event - IPC caller whose frame URL supplies the origin.
 * @param hostnames - Desktop document hosts allowed for this operation.
 */
export function assertDesktopSender(event: IpcMainInvokeEvent, hostnames: readonly string[]): void {
  const senderFrame = event.senderFrame
  if (senderFrame === null) throw new Error('mmp desktop: rejected IPC without a sender frame')
  const url = new URL(senderFrame.url)
  if (url.protocol !== `${SCHEME}:` || !hostnames.includes(url.hostname)) {
    throw new Error('mmp desktop: rejected IPC from an unowned renderer')
  }
}
