export type ClientPlatform = 'mac-arm64' | 'mac-x64' | 'win';

export const CLIENT_FILES: Record<ClientPlatform, string> = {
  'mac-arm64': '/downloads/mammoth-agent-mac-arm64.dmg',
  'mac-x64': '/downloads/mammoth-agent-mac-x64.dmg',
  win: '/downloads/mammoth-agent-win.exe',
};

export type ClientPlatformOption = {
  id: ClientPlatform;
  /** 卡片主标题 */
  title: string;
  /** 卡片副标题：芯片 / 系统 + 安装包类型 */
  sub: string;
};

/** 顺序即弹窗里的展示顺序：Apple 芯片 Mac、Intel 芯片 Mac、Windows。 */
export const CLIENT_PLATFORM_OPTIONS: ClientPlatformOption[] = [
  { id: 'mac-arm64', title: 'Apple 芯片 Mac', sub: 'M1 / M2 / M3 / M4 · .dmg' },
  { id: 'mac-x64', title: 'Intel 芯片 Mac', sub: 'Intel 处理器 · .dmg' },
  { id: 'win', title: 'Windows', sub: 'Windows 10 / 11 · .exe' },
];

/** 只判断操作系统，不猜芯片（浏览器拿不到可靠的 CPU 型号）。 */
export function detectClientOs(): 'mac' | 'win' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  if (/Mac|iPhone|iPad/i.test(ua) || /Mac/i.test(platform)) return 'mac';
  if (/Win/i.test(ua) || /Win/i.test(platform)) return 'win';
  return 'other';
}

export function clientDownloadUrl(platform: ClientPlatform) {
  return `${CLIENT_FILES[platform]}?v=${Date.now()}`;
}

export type ClientDownloadInfo = {
  availablePlatforms: ClientPlatform[];
  version: string;
  /** YYYY-MM-DD，取 `mammoth-latest.json` 的 `updated_at` */
  date: string;
  /** 安装包大小（MB），拿不到时为 null */
  sizeMb: number | null;
};

const LATEST_MANIFEST = '/downloads/mammoth-latest.json';

/** 弹窗里的统一版本信息行；任何一步失败都返回 null（整行隐藏）。 */
export async function fetchClientDownloadInfo(): Promise<ClientDownloadInfo | null> {
  try {
    const res = await fetch(LATEST_MANIFEST, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      product?: string; schema_version?: number;
      updated_at?: string;
      platforms?: Record<string, { shell?: { version?: string } } | undefined>;
    };
    const version = data.platforms?.['darwin-arm64']?.shell?.version;
    if (!version || data.product !== 'mammoth-agent' || data.schema_version !== 2) return null;
    return {
      availablePlatforms: (Object.keys(CLIENT_FILES) as ClientPlatform[]).filter(id => !!data.platforms?.[id === 'mac-arm64' ? 'darwin-arm64' : id === 'mac-x64' ? 'darwin-amd64' : 'windows-amd64']),
      version,
      date: (data.updated_at || '').slice(0, 10),
      sizeMb: await probeSizeMb(CLIENT_FILES['mac-arm64']),
    };
  } catch {
    return null;
  }
}

async function probeSizeMb(path: string): Promise<number | null> {
  try {
    const res = await fetch(path, { method: 'HEAD', cache: 'no-store' });
    if (!res.ok) return null;
    const bytes = Number(res.headers.get('content-length') || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return null;
    return Math.round(bytes / (1024 * 1024));
  } catch {
    return null;
  }
}
