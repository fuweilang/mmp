import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, extname, join } from 'path';
import { randomUUID } from 'crypto';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.pdf', '.txt', '.md', '.docx', '.pptx']);

export function uploadRoot() {
  return process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
}

export function assertAllowedFile(originalName: string, size: number) {
  if (size <= 0) throw new Error('空文件');
  if (size > MAX_BYTES) throw new Error('文件不能超过 20MB');
  const ext = extname(originalName).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw new Error('仅支持 PDF、TXT、Markdown、DOCX 和 PPTX');
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

/** Persist mammoth official knowledge files outside any enterprise tenant tree. */
export async function saveOfficialFile(agentId: string, originalName: string, buffer: Buffer) {
  const ext = assertAllowedFile(originalName, buffer.length);
  const rel = join('official', agentId, `${randomUUID()}${ext}`);
  const abs = join(uploadRoot(), rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return rel.replace(/\\/g, '/');
}


export {
  OFFICIAL_AVATAR_MAX_BYTES,
  assertOfficialAvatarUpload,
  assertSafeSvgAvatar,
  detectOfficialAvatarKind,
  detectOfficialAvatarSourceKind,
  officialAvatarUploadDir,
  rasterizeOfficialAvatar,
  saveOfficialAvatar,
} from './official-avatar';

const OFFICIAL_SKILL_DIR = 'official-skills';

/** Relative directory for one skill package revision: official-skills/<skillId>/r<revision>/ */
export function officialSkillPackageRelDir(skillId: string, revision: number) {
  const safeSkill = String(skillId || '').trim();
  if (!safeSkill || safeSkill.includes('..') || safeSkill.includes('/') || safeSkill.includes('\\')) {
    throw new Error('技能标识无效');
  }
  if (!Number.isInteger(revision) || revision < 1) throw new Error('技能包版本无效');
  return `${OFFICIAL_SKILL_DIR}/${safeSkill}/r${revision}`;
}

export function officialSkillUploadRoot() {
  return join(uploadRoot(), OFFICIAL_SKILL_DIR);
}
