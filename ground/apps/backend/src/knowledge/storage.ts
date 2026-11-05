import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, extname, join } from 'path';
import { randomUUID } from 'crypto';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.pdf', '.txt', '.md', '.doc', '.docx']);

export function uploadRoot() {
  return process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
}

export function assertAllowedFile(originalName: string, size: number) {
  if (size <= 0) throw new Error('空文件');
  if (size > MAX_BYTES) throw new Error('文件不能超过 20MB');
  const ext = extname(originalName).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw new Error('仅支持 pdf / txt / md / doc / docx');
  return ext;
}

export async function saveTenantFile(tenantId: string, originalName: string, buffer: Buffer) {
  const ext = assertAllowedFile(originalName, buffer.length);
  const rel = join(tenantId, `${randomUUID()}${ext}`);
  const abs = join(uploadRoot(), rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return rel.replace(/\\/g, '/');
}

export async function saveTenantLogo(tenantId: string, originalName: string, buffer: Buffer) {
  if (buffer.length <= 0) throw new Error('空文件');
  if (buffer.length > 2 * 1024 * 1024) throw new Error('Logo 不能超过 2MB');
  const ext = extname(originalName).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext)) {
    throw new Error('仅支持 png / jpg / webp / svg');
  }
  const rel = join(tenantId, 'logo', `${randomUUID()}${ext}`);
  const abs = join(uploadRoot(), rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return rel.replace(/\\/g, '/');
}

export function absoluteUploadPath(storagePath: string) {
  return join(uploadRoot(), storagePath);
}

export async function removeStoredFile(storagePath: string) {
  try {
    await unlink(absoluteUploadPath(storagePath));
  } catch {
    /* already gone */
  }
}
