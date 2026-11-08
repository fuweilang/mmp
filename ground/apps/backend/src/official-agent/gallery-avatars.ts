import { existsSync } from 'fs';
import { basename, join, normalize, relative, resolve, sep } from 'path';

/** Relative asset path under assets root, e.g. avatars/growth.jpg */
export type OfficialAvatarRef = {
  /** Safe file name only (no directories). */
  fileName: string;
  /** Absolute path on disk. */
  absPath: string;
  /** Relative path from assets root using forward slashes. */
  relativePath: string;
};

const AVATAR_DIR = 'avatars';
const AVATAR_FILE = /^[a-z0-9][a-z0-9_-]{0,63}\.(jpg|jpeg|png|webp)$/i;

/**
 * Normalize an optional asset-relative avatar path.
 * Only `avatars/<file>` under the assets root is accepted (no path traversal).
 */
export function normalizeAvatarRelativePath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\\/g, '/');
  if (!trimmed) return null;
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length !== 2 || parts[0] !== AVATAR_DIR) return null;
  const fileName = parts[1]!;
  if (!AVATAR_FILE.test(fileName)) return null;
  if (fileName.includes('..') || fileName.includes('\0')) return null;
  return `${AVATAR_DIR}/${fileName}`;
}

/**
 * Resolve a gallery avatar for one official agent key.
 * Prefer an explicit asset-relative path when provided and present on disk
 * (including historical remaps recorded in agents/<key>.json);
 * otherwise use the same-key convention `avatars/<key>.jpg` when that file exists.
 */
export function resolveOfficialAvatar(
  key: string,
  explicitRelativePath?: string | null,
  assetsRoot: string = defaultAssetsRoot(),
): OfficialAvatarRef | null {
  const safeKey = key.trim();
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(safeKey)) return null;

  const candidates: string[] = [];
  const explicit = normalizeAvatarRelativePath(explicitRelativePath);
  if (explicit) candidates.push(explicit);
  candidates.push(`${AVATAR_DIR}/${safeKey}.jpg`);

  const seen = new Set<string>();
  for (const relativePath of candidates) {
    if (seen.has(relativePath)) continue;
    seen.add(relativePath);
    const absPath = resolveUnderAssets(assetsRoot, relativePath);
    if (!absPath || !existsSync(absPath)) continue;
    return {
      fileName: basename(absPath),
      absPath,
      relativePath,
    };
  }
  return null;
}

/**
 * Resolve a public file download by file name only.
 * Prefer Admin-uploaded files under uploads/official-avatars/ (unique UUID names),
 * then fall back to packaged assets/avatars/. Does not change default gallery key mapping.
 */
export function resolveOfficialAvatarFile(
  fileName: string,
  assetsRoot: string = defaultAssetsRoot(),
): OfficialAvatarRef | null {
  if (typeof fileName !== 'string' || fileName !== basename(fileName) || /[\\\0]/.test(fileName)) return null;
  const base = fileName;
  if (!AVATAR_FILE.test(base)) return null;
  const uploaded = resolveUploadedOfficialAvatarFile(base);
  if (uploaded) return uploaded;
  const relativePath = `${AVATAR_DIR}/${base}`;
  const absPath = resolveUnderAssets(assetsRoot, relativePath);
  if (!absPath || !existsSync(absPath)) return null;
  return { fileName: base, absPath, relativePath };
}

/** Safe basename for a stored custom avatar relative path (official-avatars/<file>). */
export function normalizeCustomAvatarPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\\/g, '/');
  if (!trimmed || trimmed.includes('..') || trimmed.includes('\0')) return null;
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length === 1) {
    return AVATAR_FILE.test(parts[0]!) ? parts[0]! : null;
  }
  if (parts.length === 2 && parts[0] === 'official-avatars' && AVATAR_FILE.test(parts[1]!)) {
    return parts[1]!;
  }
  return null;
}

/** Resolve an Admin-uploaded avatar under uploads/official-avatars by basename. */
export function resolveUploadedOfficialAvatarFile(
  fileName: string,
  uploadRootDir: string = defaultUploadRoot(),
): OfficialAvatarRef | null {
  if (typeof fileName !== 'string' || fileName !== basename(fileName) || /[\\\0]/.test(fileName)) return null;
  const base = fileName;
  if (!AVATAR_FILE.test(base)) return null;
  if (base.includes('..') || base.includes('\0')) return null;
  const root = resolve(uploadRootDir, 'official-avatars');
  const absPath = resolve(root, base);
  const rel = relative(root, absPath);
  if (!rel || rel.startsWith('..') || normalize(rel).split(sep).includes('..')) return null;
  if (basename(absPath) !== base) return null;
  if (!existsSync(absPath)) return null;
  return {
    fileName: base,
    absPath,
    relativePath: `official-avatars/${base}`,
  };
}

/**
 * Presentation URL priority: custom uploaded avatar → packaged asset default.
 * Never invents paths; missing custom files fall through to assets.
 */
export function resolvePresentedOfficialAvatarUrl(input: {
  key: string;
  customAvatarPath?: string | null;
  explicitAssetAvatar?: string | null;
  origin?: string;
}): string | null {
  if (input.customAvatarPath === '') return null; // explicit Admin removal suppresses packaged portrait
  const customName = normalizeCustomAvatarPath(input.customAvatarPath);
  if (customName) {
    const uploaded = resolveUploadedOfficialAvatarFile(customName);
    if (uploaded) return officialAvatarPublicUrl(uploaded.fileName, input.origin);
    // 自定义文件丢失时回退内置头像，避免广场出现空白头像。
  }
  const resolved = resolveOfficialAvatar(input.key, input.explicitAssetAvatar);
  return resolved ? officialAvatarPublicUrl(resolved.fileName, input.origin) : null;
}

function defaultUploadRoot(): string {
  return process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
}

/**
 * Browser-loadable absolute URL for an avatar file.
 * Official avatars are public branding; the route is unauthenticated.
 */
export function officialAvatarPublicUrl(fileName: string, origin?: string): string {
  const base = (origin || publicGroundOrigin()).replace(/\/$/, '');
  return `${base}/api/official-agents/avatars/${encodeURIComponent(basename(fileName))}`;
}

function publicGroundOrigin(): string {
  return (
    process.env.GROUND_PUBLIC_ORIGIN ||
    process.env.MMP_PLATFORM_ORIGIN ||
    process.env.PUBLIC_ORIGIN ||
    'http://127.0.0.1:5201'
  );
}

function defaultAssetsRoot(): string {
  const candidates = [
    join(__dirname, 'assets'),
    join(__dirname, '..', '..', 'src', 'official-agent', 'assets'),
    join(process.cwd(), 'src', 'official-agent', 'assets'),
    join(process.cwd(), 'apps', 'backend', 'src', 'official-agent', 'assets'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'agents')) || existsSync(join(dir, 'avatars'))) return dir;
  }
  return candidates[0]!;
}

function resolveUnderAssets(assetsRoot: string, relativePath: string): string | null {
  const root = resolve(assetsRoot);
  const abs = resolve(root, ...relativePath.split('/'));
  const rel = relative(root, abs);
  if (!rel || rel.startsWith('..') || normalize(rel).split(sep).includes('..')) return null;
  if (!rel.replace(/\\/g, '/').startsWith(`${AVATAR_DIR}/`)) return null;
  return abs;
}

/** Uploaded icon only: skills must not inherit an unrelated packaged expert portrait. */
export function uploadedCatalogIconUrl(path: string | null | undefined): string | null {
 const name=normalizeCustomAvatarPath(path);if(!name)return null;
 const file=resolveUploadedOfficialAvatarFile(name);return file ? officialAvatarPublicUrl(file.fileName) : null;
}
