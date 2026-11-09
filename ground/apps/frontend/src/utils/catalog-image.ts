/** Client preflight only; the server independently validates and rasterizes every image again. */

const SKILL_MAX = 5 * 1024 * 1024;
const EXPERT_MAX = 5 * 1024 * 1024;
/** Both profiles accept the same camera-sized inputs; the server resizes and rasterizes. */
const SKILL_MAX_EDGE = 10000;
const EXPERT_MAX_EDGE = 10000;
const SKILL_MAX_PIXELS = 40_000_000;
const EXPERT_MAX_PIXELS = 40_000_000;

export type CatalogImageProfile = 'skill' | 'expert';

function extensionOf(name: string): string | null {
  return name.toLowerCase().match(/\.(png|jpe?g|webp|gif|svg)$/)?.[1] ?? null;
}

async function readMagic(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 64).arrayBuffer());
}

function detectKind(bytes: Uint8Array, headText?: string): 'png' | 'jpeg' | 'webp' | 'gif' | 'svg' | null {
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 16 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'gif';
  const text = (headText ?? ascii(0, Math.min(bytes.length, 64))).replace(/^\uFEFF/, '').trimStart();
  if (/^(<\?xml[\s\S]*?)?<svg[\s>]/i.test(text)) return 'svg';
  return null;
}

/** Strip scriptable / external-reference constructs before any SVG is drawn to canvas. */
export function sanitizeSvgTextForPreview(raw: string): string {
  if (/<!ENTITY/i.test(raw) || /<!DOCTYPE/i.test(raw)) {
    throw new Error('不支持含 DTD/实体的 SVG');
  }
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('SVG 无法解析');
  doc.querySelectorAll('script, foreignObject').forEach((node) => node.remove());
  doc.querySelectorAll('*').forEach((node) => {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith('on')) node.removeAttribute(attr.name);
      if ((name === 'href' || name === 'xlink:href') && /^(https?:|file:|data:|\/\/|\.|\/)/i.test(value)) {
        node.removeAttribute(attr.name);
      }
      if ((name === 'style' || name === 'href') && /url\s*\(|@import/i.test(value)) {
        node.removeAttribute(attr.name);
      }
    }
  });
  const svg = doc.documentElement;
  if (!svg || svg.localName.toLowerCase() !== 'svg') throw new Error('不是有效的 SVG');
  return new XMLSerializer().serializeToString(svg);
}

async function decodeToBitmap(file: File, kind: string): Promise<ImageBitmap | HTMLImageElement> {
  if (kind === 'svg') {
    const raw = await file.text();
    if (raw.length > 512 * 1024) throw new Error('SVG 过大');
    const sanitized = sanitizeSvgTextForPreview(raw);
    const blob = new Blob([sanitized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('无法解码 SVG，请换一张'));
        el.src = url;
      });
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('无法解码图片，请重新选择'));
      el.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function bitmapSize(image: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if ('naturalWidth' in image) {
    return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
  }
  return { width: image.width, height: image.height };
}

export async function validateCatalogImage(
  file: File,
  profile: CatalogImageProfile = 'skill',
): Promise<void> {
  const max = profile === 'expert' ? EXPERT_MAX : SKILL_MAX;
  if (!file.size || file.size > max) {
    throw new Error('请选择不超过5MB的图片');
  }
  if (/[\\/\0]/.test(file.name)) throw new Error('图片文件名无效');
  const extension = extensionOf(file.name);
  const mime = file.type.toLowerCase();
  const allowedExt = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];
  const allowedMime = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/svg'];
  if (!extension || !allowedExt.includes(extension) || !allowedMime.includes(mime)) {
    throw new Error('仅支持 PNG、JPG、WebP、GIF、SVG');
  }
  const bytes = await readMagic(file);
  const headText =
    extension === 'svg' ? new TextDecoder('utf-8', { fatal: false }).decode(bytes) : undefined;
  const kind = detectKind(bytes, headText);
  const wanted =
    extension === 'jpg' || extension === 'jpeg'
      ? 'jpeg'
      : extension === 'svg'
        ? 'svg'
        : extension;
  if (!kind || kind !== wanted) throw new Error('文件内容、扩展名和图片类型不一致');
  if (kind === 'svg' && mime !== 'image/svg+xml' && mime !== 'image/svg') {
    throw new Error('声明的图片类型与文件内容不符');
  }
  if (kind !== 'svg' && (mime === 'image/jpg' ? 'image/jpeg' : mime) !== `image/${kind}`) {
    throw new Error('文件内容、扩展名和图片类型不一致');
  }
  const bitmap = await decodeToBitmap(file, kind);
  try {
    const { width, height } = bitmapSize(bitmap);
    const maxEdge = profile === 'expert' ? EXPERT_MAX_EDGE : SKILL_MAX_EDGE;
    const maxPixels = profile === 'expert' ? EXPERT_MAX_PIXELS : SKILL_MAX_PIXELS;
    if (!width || !height || width > maxEdge || height > maxEdge || width * height > maxPixels) {
      throw new Error(`图片尺寸过大或无效（当前 ${width}×${height}）。请压缩到约 4000 万像素以内，最长边不超过 ${maxEdge}`);
    }
  } finally {
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}
