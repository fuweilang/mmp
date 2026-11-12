/** User-authorized downloads and separate installation of one version-bound Desktop release. */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import electronUpdater, { type AppUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import { gt, valid } from 'semver'
import type { DesktopUpdateState } from './ipc.ts'
import { DesktopUpdateHttpExecutor } from './update-http-executor.ts'
import { DesktopUpdatePreparationError } from './update-error.ts'

const { autoUpdater } = electronUpdater

/**
 * Product-qualified update targets; Linux is not an advertised update channel.
 * @param platform Installed operating system.
 * @param architecture Installed binary architecture (not browser CPU detection).
 * @returns Whether the product publishes a matching update feed.
 */
export function supportsDesktopUpdates(platform: NodeJS.Platform, architecture: string): boolean {
  return (platform === 'darwin' && (architecture === 'arm64' || architecture === 'x64'))
    || (platform === 'win32' && architecture === 'x64')
}


/** Owns one updater target until its download and installation settle. */
export class DesktopUpdateCoordinator {
  private current: DesktopUpdateState = { phase: 'idle' }
  private candidate: string | undefined
  private checked = false
  private releaseNotes: string | undefined
  private downloaded = false
  private disposed = false
  private checkVisible = false
  private checkFailed = false
  private checkOperation: Promise<DesktopUpdateState> | undefined
  private downloadOperation: Promise<DesktopUpdateState> | undefined
  private installOperation: Promise<DesktopUpdateState> | undefined

  private readonly onProgress = (progress: ProgressInfo): void => {
    if (this.downloadOperation === undefined || this.downloaded) return
    const percent = Math.min(100, Math.max(0, progress.percent))
    this.setState({ phase: percent >= 100 ? 'verifying' : 'downloading', ...this.target(), percent })
  }

  private readonly onDownloaded = (info: UpdateInfo): void => {
    if (this.downloadOperation === undefined || info.version !== this.candidate) return
    this.downloaded = true
  }

  private readonly onError = (error: Error): void => {
    // Check/download promises own their failures. Installation can fail after quitAndInstall returns.
    if (this.current.phase === 'installing') {
      this.setState(this.failure(error, 'install'))
    }
  }

  /**
   * @param publish - Receives observable states for every Desktop window.
   * @param beforeRestart - Completes task authorization, admission locking, and owned-process shutdown.
   * @param updater - Process-owned Electron updater, replaceable at the network/platform test boundary.
   * @param enabled - Whether this process has a packaged update source.
   * @param currentVersion - Actual installed application version.
   * @param channel - Installed package channel; omitted test/local callers retain nightly.
   * @param downloadResult - Once per completed download attempt, including platform preparation failures.
   */
  constructor(
    private readonly publish: (state: DesktopUpdateState) => DesktopUpdateState,
    private readonly beforeRestart: () => Promise<boolean>,
    private readonly updater: AppUpdater = autoUpdater,
    private readonly enabled: () => boolean = () => app.isPackaged && supportsDesktopUpdates(process.platform, process.arch) && existsSync(join(process.resourcesPath, 'app-update.yml')),
    private readonly currentVersion: () => string = () => app.getVersion(),
    private readonly downloadResult?: (success: boolean, reason?: string) => void,
    private readonly channel: 'nightly' | 'latest' = 'nightly',
  ) {
    if (updater === autoUpdater) {
      // electron-updater omits this internal transport property from its public declarations.
      // Real-Electron qualification exercises the pinned dependency integration.
      const transportOwner = updater as AppUpdater & { httpExecutor: DesktopUpdateHttpExecutor }
      transportOwner.httpExecutor = new DesktopUpdateHttpExecutor(
        Number(process.env.MMP_DESKTOP_UPDATE_HTTP_IDLE_TIMEOUT_MS ?? 60_000),
        (authInfo, callback) => { updater.emit('login', authInfo, callback) },
      )
    }
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
    this.updater.channel = channel
    this.updater.allowPrerelease = channel === 'nightly'
    // Selecting a channel can enable downgrade in electron-updater.
    this.updater.allowDowngrade = false
    this.updater.on('download-progress', this.onProgress)
    this.updater.on('update-downloaded', this.onDownloaded)
    this.updater.on('error', this.onError)
  }

  /** Latest observable state; complete download identity remains main-process-owned. */
  get state(): DesktopUpdateState { return this.current }

  /** Whether the last check attempt failed; automatic checks stay silent yet still back off. */
  get lastCheckFailed(): boolean { return this.checkFailed }

  /** Real installed identity and bounded plain-text feed content. */
  get info(): { currentVersion: string; supported: boolean; checked: boolean; releaseNotes?: string } {
    return { currentVersion: this.currentVersion(), supported: this.enabled(), checked: this.checked,
      ...(this.releaseNotes === undefined ? {} : { releaseNotes: this.releaseNotes }) }
  }

  /**
   * Check metadata without downloading, joining any current check.
   * @param manual - Whether to show checking and a failed result; automatic polling stays quiet.
   * @returns The shared check result; errors stay inline, without a dialog or download.
   */
  async check(manual = false): Promise<DesktopUpdateState> {
    this.assertLive()
    if (this.downloadOperation !== undefined || this.installOperation !== undefined || this.downloaded) return this.current
    if (!manual && this.current.phase === 'error' && this.current.failedOperation === 'download') return this.current
    // A manual caller joins an in-flight automatic check and makes its outcome visible.
    if (manual) this.checkVisible = true
    this.checkOperation ??= Promise.resolve().then(() => this.doCheck())
      .finally(() => { this.checkOperation = undefined; this.checkVisible = false })
    const result = await this.checkOperation
    return result
  }

  /**
   * @param version - Version shown in the user's download confirmation.
   * @returns Download readiness or failure, without authorizing installation.
   */
  async download(version: string): Promise<DesktopUpdateState> {
    this.assertLive()
    if (this.downloaded || this.installOperation !== undefined) return this.current
    this.downloadOperation ??= Promise.resolve().then(async () => {
      await this.checkOperation
      this.assertLive()
      if (this.candidate === undefined) throw new Error('desktop update: no checked update is available')
      if (version !== this.candidate) throw new Error('desktop update: download confirmation is stale')
      this.setState({ phase: 'downloading', version, percent: 0 })
      try {
        await this.updater.downloadUpdate()
        if (!this.downloaded) throw new Error('desktop update: platform preparation did not report readiness')
        this.downloadResult?.(true)
        return this.setState({ phase: 'ready', version })
      } catch (error) {
        this.downloaded = false
        this.downloadResult?.(false, error instanceof DesktopUpdatePreparationError ? error.kind : 'download_failed')
        return this.setState(this.failure(error, 'download'))
      }
    }).finally(() => { this.downloadOperation = undefined })
    return this.downloadOperation
  }

  /**
   * Install a prepared target after a separate user confirmation.
   * @param version - Exact version displayed in the confirmation, never a renderer-selected URL.
   * @returns Installation handoff or a recoverable preparation error.
   */
  async install(version: string): Promise<DesktopUpdateState> {
    this.assertLive()
    if (!this.downloaded || this.downloadOperation !== undefined || version !== this.candidate) throw new Error('desktop update: confirmed target is not ready')
    this.installOperation ??= Promise.resolve().then(async () => {
      this.setState({ phase: 'installing', version })
      try {
        if (!await this.beforeRestart()) return this.setState({ phase: 'ready', version })
        this.assertLive()
        this.updater.quitAndInstall(true, true)
        return this.current
      } catch (error) {
        if (this.current.phase === 'error' && this.current.failedOperation === 'install') return this.current
        return this.setState(this.failure(error, 'install'))
      }
    }).finally(() => { this.installOperation = undefined })
    return this.installOperation
  }

  /** Remove owned listeners and prevent pending library operations from publishing into closed UI. */
  dispose(): void {
    this.disposed = true
    this.updater.off('download-progress', this.onProgress)
    this.updater.off('update-downloaded', this.onDownloaded)
    // Pending updater promises can still emit EventEmitter errors during shutdown.
    void Promise.allSettled([this.checkOperation, this.downloadOperation, this.installOperation])
      .then(() => { this.updater.off('error', this.onError) })
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('desktop update: coordinator is disposed')
  }

  private setState(state: DesktopUpdateState): DesktopUpdateState {
    if (!this.disposed) {
      this.current = state
      this.publish(state)
    }
    return state
  }

  private failure(error: unknown, failedOperation: 'check' | 'download' | 'install'): DesktopUpdateState {
    return { phase: 'error', ...this.target(), failedOperation,
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof DesktopUpdatePreparationError ? {
        preparationFailure: error.kind,
        ...(error.technicalDetails === undefined ? {} : { technicalDetails: error.technicalDetails }),
      } : {}) }
  }

  private target(): { version?: string } {
    return this.candidate === undefined ? {} : { version: this.candidate }
  }

  private async doCheck(): Promise<DesktopUpdateState> {
    try {
      this.assertLive()
      this.checked = false
      // An automatic poll must not flash progress in the sidebar; only an explicit request shows checking.
      if (this.checkVisible) this.setState({ phase: 'checking' })
      if (!this.enabled()) throw new Error('desktop update: this application has no packaged update source')
      const result = await this.updater.checkForUpdates()
      if (result === null) throw new Error('desktop update: no check result was returned')
      const version = result.updateInfo.version
      if (valid(version) === null) throw new Error('desktop update: feed version is invalid')
      if (this.channel === 'latest' && version.includes('-')) throw new Error('desktop update: latest feed contains a prerelease')
      this.checkFailed = false
      this.checked = true
      const notes = result.updateInfo.releaseNotes
      this.releaseNotes = (typeof notes === 'string' ? notes
        : Array.isArray(notes) ? notes.map(item => item.note ?? '').join('\n\n') : '').slice(0, 20_000)
      this.candidate = result.isUpdateAvailable && gt(version, this.currentVersion()) ? version : undefined
      // A quiet poll publishes only a change: a new offer, or clearing a previously visible state.
      if (this.checkVisible || this.current.phase !== 'idle' || this.candidate !== undefined) {
        return this.setState(this.candidate === undefined ? { phase: 'idle' } : { phase: 'available', version })
      }
      return this.current
    } catch (error) {
      this.checkFailed = true
      // A failed check cannot vouch for the offer it made last time.
      this.candidate = undefined
      this.releaseNotes = undefined
      if (this.checkVisible) return this.setState(this.failure(error, 'check'))
      // Automatic failures stay quiet; they withdraw a stale offer but never raise a resident error badge.
      return this.current.phase === 'available' ? this.setState({ phase: 'idle' }) : this.current
    }
  }
}
