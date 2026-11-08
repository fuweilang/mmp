import { isAbsolute, relative, resolve, sep } from 'path';
import { LibraryError } from './library.errors';
import { LIBRARY_ALLOWED_EXTENSIONS, type LibraryLimits } from './library.limits';

const ALLOWED = new Set<string>(LIBRARY_ALLOWED_EXTENSIONS);

/** 只留文件名。调用方传来的目录不能进存储键，也不能进显示名以外的地方。 */
export function safeDisplayName(original: string): string {
  const normalized = original.replace(/\\/g, '/');
  const base = normalized.slice(normalized.lastIndexOf('/') + 1).replace(/[\u0000-\u001f]/g, '').trim();
  if (!base || base === '.' || base === '..') {
    throw new LibraryError(400, '文件名无效', 'BAD_NAME');
  }
  if (base.length > 180) throw new LibraryError(400, '文件名过长', 'BAD_NAME');
  return base;
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  return name.slice(dot).toLowerCase();
}

export function assertAllowedUpload(name: string, bytes: Buffer, limits: LibraryLimits): string {
  if (bytes.length <= 0) throw new LibraryError(400, '空文件', 'EMPTY');
  if (bytes.length > limits.maxFileBytes) {
    throw new LibraryError(400, `单个文件不能超过 ${limits.maxFileBytes} 字节`, 'TOO_LARGE');
  }
  const ext = fileExtension(name);
  if (!ALLOWED.has(ext) || !limits.allowedExtensions.includes(ext)) throw new LibraryError(400, '这个文件类型不允许上传', 'BAD_TYPE');
  if (isDangerousMagic(bytes)) throw new LibraryError(400, '文件内容不像允许的文档', 'BAD_TYPE');
  return ext;
}

/** PE / ELF 不能靠改扩展名进来。 */
export function isDangerousMagic(bytes: Buffer): boolean {
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return true;
  if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
    return true;
  }
  return false;
}

export function storageKeyFor(tenantId: string, versionId: string, ext: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(tenantId) || !/^[A-Za-z0-9_-]+$/.test(versionId)) {
    throw new LibraryError(400, '存储路径无效', 'BAD_PATH');
  }
  const safeExt = /^\.[a-z0-9]{1,12}$/.test(ext) ? ext : '.bin';
  return `${tenantId}/${versionId}${safeExt}`;
}

/** 存储键必须落在资料根目录里。 */
export function resolveUnderRoot(root: string, storageKey: string): string {
  if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(storageKey) || storageKey.includes('..')) {
    throw new LibraryError(400, '存储路径无效', 'BAD_PATH');
  }
  const rootAbs = resolve(root);
  const abs = resolve(rootAbs, storageKey);
  const rel = relative(rootAbs, abs);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.includes(`..${sep}`)) {
    throw new LibraryError(400, '存储路径无效', 'BAD_PATH');
  }
  return abs;
}

export function safeNodeName(name: string): string {
  const trimmed = name.replace(/[\u0000-\u001f]/g, '').trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new LibraryError(400, '名称无效', 'BAD_NAME');
  }
  if (trimmed.length > 180) throw new LibraryError(400, '名称过长', 'BAD_NAME');
  return trimmed;
}

export function safeLinkUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new LibraryError(400, '链接必须是 http 或 https 网址', 'BAD_LINK');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LibraryError(400, '链接必须是 http 或 https 网址', 'BAD_LINK');
  }
  if (url.href.length > 2000) throw new LibraryError(400, '链接过长', 'BAD_LINK');
  return url.href;
}
