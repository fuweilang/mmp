import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { rasterizeOfficialAvatar } from '../knowledge/official-avatar';
import { uploadRoot } from '../knowledge/storage';

const DIR = 'user-avatars';
const FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i;

/** Public path for one stored account picture, or null when the path is not ours. */
export function userAvatarPublicUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  const name = storagePath.split('/').pop() ?? '';
  if (!FILE.test(name) || storagePath !== `${DIR}/${name}`) return null;
  return `/api/auth/avatars/${name}`;
}

/** Absolute file for a public avatar name, or null when the name is not a stored picture. */
export function userAvatarFile(fileName: string): string | null {
  if (!FILE.test(fileName)) return null;
  const abs = join(uploadRoot(), DIR, fileName);
  return existsSync(abs) ? abs : null;
}

/** Resize to a PNG under uploads/user-avatars and return the storage path. */
export async function saveUserAvatar(originalName: string, buffer: Buffer, mimetype?: string | null) {
  const { png } = await rasterizeOfficialAvatar(originalName, buffer, mimetype);
  const fileName = `${randomUUID()}.png`;
  const abs = join(uploadRoot(), DIR, fileName);
  await mkdir(join(uploadRoot(), DIR), { recursive: true });
  await writeFile(abs, png);
  return `${DIR}/${fileName}`;
}
