import { mkdir, writeFile } from 'fs/promises';
import { dirname, extname, join } from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

function uploadRoot() {
  return process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
}

/** Kept in sync with Admin expert avatar UX and multer limit. */
export const OFFICIAL_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const OFFICIAL_AVATAR_DIR = 'official-avatars';
/** Final stored avatar longest edge (px). */
export const OFFICIAL_AVATAR_MAX_EDGE = 2048;
const MAX_OUTPUT_PIXELS = OFFICIAL_AVATAR_MAX_EDGE * OFFICIAL_AVATAR_MAX_EDGE;
/**
 * Decode budget for phone photos / large raster sources.
 * Must be high enough for common ≤5MB camera JPEGs (often 12–40MP),
 * then we resize down — never leave a huge decoded bitmap as the stored avatar.
 * Still far below sharp's historical default (~268MP) decompression-bomb range.
 */
export const OFFICIAL_AVATAR_MAX_INPUT_PIXELS = 40_000_000;
/** Target edge used when choosing SVG density so huge viewBox/width cannot explode. */
const SVG_TARGET_EDGE = 1024;
const SVG_MAX_CHARS = 512 * 1024;

export type OfficialAvatarSourceKind = 'png' | 'jpeg' | 'webp' | 'gif' | 'svg';

export function detectOfficialAvatarSourceKind(buffer: Buffer): OfficialAvatarSourceKind | null {
  if (!buffer || buffer.length < 12) return null;
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp';
  }
  if (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a') {
    return 'gif';
  }
  const head = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (/^(<\?xml[\s\S]*?)?<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

/** Reject SVG payloads that can pull remote/local resources or execute script. */
export function assertSafeSvgAvatar(buffer: Buffer): void {
  if (buffer.length > SVG_MAX_CHARS) throw new Error('SVG 过大');
  const text = buffer.toString('utf8');
  if (/<!ENTITY/i.test(text) || /<!DOCTYPE/i.test(text)) {
    throw new Error('不支持含 DTD/实体的 SVG');
  }
  if (/<script[\s>]/i.test(text) || /on[a-z]+\s*=/i.test(text)) {
    throw new Error('SVG 含脚本，已拒绝');
  }
  if (/<foreignObject[\s>]/i.test(text)) throw new Error('SVG 含 foreignObject，已拒绝');
  if (
    /(?:xlink:)?href\s*=\s*["']\s*(?:https?:|file:|data:|\/\/)/i.test(text) ||
    /(?:xlink:)?href\s*=\s*["']\s*[.]{1,2}\//i.test(text)
  ) {
    throw new Error('SVG 含外链或本地引用，已拒绝');
  }
  if (/@import/i.test(text) || /url\s*\(\s*["']?\s*(?:https?:|file:|\/\/)/i.test(text)) {
    throw new Error('SVG 含外部样式引用，已拒绝');
  }
  if (!/<svg[\s>]/i.test(text)) throw new Error('不是有效的 SVG');
}

/**
 * Read SVG intrinsic CSS size / viewBox so density can target a small avatar raster.
 * Unitless numbers are treated as px; unknown → fallback square.
 */
export function parseSvgIntrinsicSize(svgText: string): { width: number; height: number } {
  const root = svgText.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const num = (raw: string | undefined): number | null => {
    if (!raw) return null;
    const m = String(raw).trim().match(/^([0-9.]+)\s*(px|pt|em|rem|%)?$/i);
    if (!m) return null;
    const value = Number(m[1]);
    if (!Number.isFinite(value) || value <= 0) return null;
    const unit = (m[2] || 'px').toLowerCase();
    if (unit === '%') return null;
    if (unit === 'pt') return value * (96 / 72);
    return value;
  };
  const widthAttr = num(root.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1]);
  const heightAttr = num(root.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1]);
  const viewBox = root.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  let vbW = 0;
  let vbH = 0;
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      vbW = Math.abs(parts[2]);
      vbH = Math.abs(parts[3]);
    }
  }
  const width = widthAttr || vbW || SVG_TARGET_EDGE;
  const height = heightAttr || vbH || SVG_TARGET_EDGE;
  return { width, height };
}

/** Density so the larger SVG axis lands near SVG_TARGET_EDGE (px). May be << 72 for huge viewBoxes. */
export function svgAvatarDensity(svgText: string): number {
  const { width, height } = parseSvgIntrinsicSize(svgText);
  const maxDim = Math.max(width, height, 1);
  const density = (SVG_TARGET_EDGE / maxDim) * 72;
  return Math.min(300, Math.max(0.1, Math.round(density * 1000) / 1000));
}

/** Force explicit pixel width/height so sharp does not materialize enormous viewBox bitmaps. */
export function normalizeSvgBufferForRaster(buffer: Buffer): Buffer {
  const text = buffer.toString('utf8');
  const { width, height } = parseSvgIntrinsicSize(text);
  const scale = SVG_TARGET_EDGE / Math.max(width, height, 1);
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  const next = text.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
    let cleaned = String(attrs)
      .replace(/\swidth\s*=\s*("[^"]*"|'[^']*')/gi, '')
      .replace(/\sheight\s*=\s*("[^"]*"|'[^']*')/gi, '');
    if (!/\bpreserveAspectRatio\s*=/i.test(cleaned)) {
      cleaned += ' preserveAspectRatio="xMidYMid meet"';
    }
    return `<svg${cleaned} width="${outW}" height="${outH}">`;
  });
  if (next === text) throw new Error('无法规范化 SVG 尺寸');
  return Buffer.from(next, 'utf8');
}

function allowedMimeForKind(kind: OfficialAvatarSourceKind): string[] {
  if (kind === 'png') return ['image/png'];
  if (kind === 'jpeg') return ['image/jpeg', 'image/jpg'];
  if (kind === 'webp') return ['image/webp'];
  if (kind === 'gif') return ['image/gif'];
  return ['image/svg+xml', 'image/svg'];
}

function allowedExtForKind(kind: OfficialAvatarSourceKind): string[] {
  if (kind === 'png') return ['.png'];
  if (kind === 'jpeg') return ['.jpg', '.jpeg'];
  if (kind === 'webp') return ['.webp'];
  if (kind === 'gif') return ['.gif'];
  return ['.svg'];
}

/**
 * Validate source upload (size/name/mime/magic). Does not persist.
 * SVG/GIF are accepted as sources and must be rasterized before save.
 */
export function assertOfficialAvatarUpload(
  originalName: string,
  buffer: Buffer,
  mimetype?: string | null,
): { kind: OfficialAvatarSourceKind } {
  if (!buffer || buffer.length <= 0) throw new Error('空文件');
  if (buffer.length > OFFICIAL_AVATAR_MAX_BYTES) throw new Error('头像不能超过 5MB');
  if (/[\\/\0]/.test(originalName)) throw new Error('图片文件名无效');
  const mime = String(mimetype || '').toLowerCase().trim();
  const nameExt = extname(originalName).toLowerCase();
  const kind = detectOfficialAvatarSourceKind(buffer);
  if (!kind) throw new Error('文件内容不是有效的 PNG / JPEG / WebP / GIF / SVG');
  if (!allowedExtForKind(kind).includes(nameExt)) {
    throw new Error('扩展名与文件内容不符');
  }
  if (!allowedMimeForKind(kind).includes(mime)) {
    throw new Error('声明的图片类型与文件内容不符');
  }
  if (kind === 'svg') assertSafeSvgAvatar(buffer);
  return { kind };
}

function chinesePixelLimitMessage(width?: number, height?: number): string {
  const size =
    width && height ? `当前约 ${width}×${height} 像素` : '当前图片像素过多';
  return `${size}，超出可安全解码上限（约 ${OFFICIAL_AVATAR_MAX_INPUT_PIXELS.toLocaleString('zh-CN')} 像素）。请压缩后再上传；保存时会缩放到最长边 ${OFFICIAL_AVATAR_MAX_EDGE} 像素以内`;
}

function mapSharpProcessingError(error: unknown, meta?: { width?: number; height?: number }): Error {
  if (error instanceof Error) {
    if (/头像|SVG|扩展名|声明|空文件|有效|不符|解码|尺寸|像素|栅格|安全/.test(error.message)) {
      return error;
    }
    if (/exceeds pixel limit|pixel limit|Input image exceeds/i.test(error.message)) {
      return new Error(chinesePixelLimitMessage(meta?.width, meta?.height));
    }
    if (/memory|limit|too large|VipsJpeg|Image too large/i.test(error.message)) {
      return new Error(
        `图片过大或无法安全解码${meta?.width && meta?.height ? `（${meta.width}×${meta.height}）` : ''}，请换一张较小的图`,
      );
    }
    return new Error(`图片处理失败：${error.message}`);
  }
  return new Error('图片处理失败');
}

/** Decode + normalize to a static PNG. Never returns/stores SVG or animated GIF. */
export async function rasterizeOfficialAvatar(
  originalName: string,
  buffer: Buffer,
  mimetype?: string | null,
): Promise<{ png: Buffer; sourceKind: OfficialAvatarSourceKind }> {
  const { kind } = assertOfficialAvatarUpload(originalName, buffer, mimetype);
  const sourceBuffer = kind === 'svg' ? normalizeSvgBufferForRaster(buffer) : buffer;
  const density = kind === 'svg' ? 72 : undefined;

  // Probe metadata with a raised input budget so common phone JPEGs can be resized down.
  let probeMeta: { width?: number; height?: number } | undefined;
  try {
    probeMeta = await sharp(sourceBuffer, {
      animated: false,
      pages: 1,
      page: 0,
      limitInputPixels: OFFICIAL_AVATAR_MAX_INPUT_PIXELS,
      density,
      failOn: 'error',
    }).metadata();
  } catch (error) {
    throw mapSharpProcessingError(error);
  }

  const width = probeMeta.width ?? 0;
  const height = probeMeta.height ?? 0;
  if (!width || !height) throw new Error('无法解码图片');
  if (width * height > OFFICIAL_AVATAR_MAX_INPUT_PIXELS) {
    throw new Error(chinesePixelLimitMessage(width, height));
  }

  try {
    const png = await sharp(sourceBuffer, {
      animated: false,
      pages: 1,
      page: 0,
      limitInputPixels: OFFICIAL_AVATAR_MAX_INPUT_PIXELS,
      density,
      failOn: 'error',
    })
      .rotate()
      .resize(OFFICIAL_AVATAR_MAX_EDGE, OFFICIAL_AVATAR_MAX_EDGE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    if (!png.length || png.length > OFFICIAL_AVATAR_MAX_BYTES) {
      throw new Error('栅格化结果无效或过大');
    }
    if (detectOfficialAvatarSourceKind(png) !== 'png') throw new Error('栅格化失败');

    const outMeta = await sharp(png).metadata();
    if (
      !outMeta.width ||
      !outMeta.height ||
      outMeta.width > OFFICIAL_AVATAR_MAX_EDGE ||
      outMeta.height > OFFICIAL_AVATAR_MAX_EDGE ||
      outMeta.width * outMeta.height > MAX_OUTPUT_PIXELS
    ) {
      throw new Error(`输出尺寸异常，最长边需 ≤ ${OFFICIAL_AVATAR_MAX_EDGE}`);
    }

    return { png, sourceKind: kind };
  } catch (error) {
    throw mapSharpProcessingError(error, { width, height });
  }
}

/** Persist a unique raster avatar under uploads/official-avatars/*.png — never SVG. */
export async function saveOfficialAvatar(
  agentId: string,
  originalName: string,
  buffer: Buffer,
  mimetype?: string | null,
) {
  const safeAgent = String(agentId || '').trim();
  if (!safeAgent || safeAgent.includes('..') || safeAgent.includes('/') || safeAgent.includes('\\')) {
    throw new Error('专家标识无效');
  }
  const { png } = await rasterizeOfficialAvatar(originalName, buffer, mimetype);
  const fileName = `${randomUUID()}.png`;
  const abs = join(uploadRoot(), OFFICIAL_AVATAR_DIR, fileName);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, png);
  return `${OFFICIAL_AVATAR_DIR}/${fileName}`;
}

export function officialAvatarUploadDir() {
  return join(uploadRoot(), OFFICIAL_AVATAR_DIR);
}

/** Back-compat alias used by older tests. */
export function detectOfficialAvatarKind(buffer: Buffer): 'png' | 'jpeg' | 'webp' | null {
  const kind = detectOfficialAvatarSourceKind(buffer);
  if (kind === 'png' || kind === 'jpeg' || kind === 'webp') return kind;
  return null;
}
