/** Download sources for the desktop client installers, same-origin on the hosted deployment. */
export type ClientPlatform = 'mac-arm64' | 'mac-x64' | 'win'

export const CLIENT_FILES: Record<ClientPlatform, string> = {
  'mac-arm64': '/downloads/mammoth-agent-mac-arm64.dmg',
  'mac-x64': '/downloads/mammoth-agent-mac-x64.dmg',
  win: '/downloads/mammoth-agent-win.exe',
}

export interface ClientPlatformOption {
  readonly id: ClientPlatform
  readonly titleKey: 'optionMacArm' | 'optionMacIntel' | 'optionWindows'
  readonly subKey: 'optionMacArmSub' | 'optionMacIntelSub' | 'optionWindowsSub'
}

/** Display order: Apple-silicon Mac, Intel Mac, Windows. */
export const CLIENT_PLATFORM_OPTIONS: readonly ClientPlatformOption[] = [
  { id: 'mac-arm64', titleKey: 'optionMacArm', subKey: 'optionMacArmSub' },
  { id: 'mac-x64', titleKey: 'optionMacIntel', subKey: 'optionMacIntelSub' },
  { id: 'win', titleKey: 'optionWindows', subKey: 'optionWindowsSub' },
]

/** Detect only the OS, never the chip: browsers cannot report the CPU model reliably. */
export function detectClientOs(): 'mac' | 'win' | 'other' {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  if (/Mac|iPhone|iPad/i.test(ua) || /Mac/i.test(platform)) return 'mac'
  if (/Win/i.test(ua) || /Win/i.test(platform)) return 'win'
  return 'other'
}

/** Choose the desktop handler from the Web page's hostname.
 * @param hostname - Browser hostname without the port.
 * @returns The development or installed desktop launch URL.
 */
export function clientLaunchUrl(hostname: string): string {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
  return local ? 'mmp-dev://open' : 'mmp://open'
}

export function clientDownloadUrl(platform: ClientPlatform): string {
  return `${CLIENT_FILES[platform]}?v=${Date.now()}`
}

export interface ClientDownloadInfo {
  readonly availablePlatforms: readonly ClientPlatform[]
  readonly version: string
  /** YYYY-MM-DD from `mammoth-latest.json` `updated_at`. */
  readonly date: string
  /** Installer size in MB; null when the probe fails. */
  readonly sizeMb: number | null
}

const LATEST_MANIFEST = '/downloads/mammoth-latest.json'

/**
 * Version line for the dialog; any failure returns null and the row hides.
 * Same-origin on the hosted deployment; absent on a plain `mmp web` server.
 */
export async function fetchClientDownloadInfo(): Promise<ClientDownloadInfo | null> {
  try {
    const res = await fetch(LATEST_MANIFEST, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json() as {
      product?: string; schema_version?: number;
      updated_at?: string
      platforms?: Record<string, { shell?: { version?: string } } | undefined>
    }
    const version = data.platforms?.['darwin-arm64']?.shell?.version
    if (!version || data.product !== 'mammoth-agent' || data.schema_version !== 2) return null
    return {
      availablePlatforms: (Object.keys(CLIENT_FILES) as ClientPlatform[]).filter(id => !!data.platforms?.[id === 'mac-arm64' ? 'darwin-arm64' : id === 'mac-x64' ? 'darwin-amd64' : 'windows-amd64']),
      version,
      date: (data.updated_at || '').slice(0, 10),
      sizeMb: await probeSizeMb(CLIENT_FILES['mac-arm64']),
    }
  } catch {
    return null
  }
}

async function probeSizeMb(path: string): Promise<number | null> {
  try {
    const res = await fetch(path, { method: 'HEAD', cache: 'no-store' })
    if (!res.ok) return null
    const bytes = Number(res.headers.get('content-length') || 0)
    if (!Number.isFinite(bytes) || bytes <= 0) return null
    return Math.round(bytes / (1024 * 1024))
  } catch {
    return null
  }
}
