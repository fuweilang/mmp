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


const OFFICIAL_AVATAR_DIR = 'official-avatars';
const OFFICIAL_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const OFFICIAL_AVATAR_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export type OfficialAvatarKind = 'png' | 'jpeg' | 'webp';

/** Detect PNG / JPEG / WebP by magic bytes. Rejects SVG and other formats. */
export function detectOfficialAvatarKind(buffer: Buffer): OfficialAvatarKind | null {
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
  // RIFF....WEBP
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
  return null;
}

function extForOfficialAvatarKind(kind: OfficialAvatarKind): string {
  if (kind === 'png') return '.png';
  if (kind === 'webp') return '.webp';
  return '.jpg';
}

/**
 * Validate Admin official-agent avatar upload.
 * Size ≤2MB; PNG/JPEG/WebP only; magic bytes must match; SVG/HTML rejected.
 */
export function assertOfficialAvatarUpload(
  originalName: string,
  buffer: Buffer,
  mimetype?: string | null,
): { kind: OfficialAvatarKind; ext: string } {
  if (!buffer || buffer.length <= 0) throw new Error('空文件');
  if (buffer.length > OFFICIAL_AVATAR_MAX_BYTES) throw new Error('头像不能超过 2MB');
  if (/[\\/\0]/.test(originalName)) throw new Error('图片文件名无效');
  const lowerName = String(originalName || '').toLowerCase();
  if (lowerName.endsWith('.svg') || lowerName.includes('.svg.')) {
    throw new Error('不支持 SVG 头像');
  }
  const mime = String(mimetype || '').toLowerCase().trim();
  if (
    !['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mime)
  ) {
    throw new Error('仅支持 PNG、JPEG、WebP 头像');
  }
  const kind = detectOfficialAvatarKind(buffer);
  if (!kind) throw new Error('文件内容不是有效的 PNG / JPEG / WebP');
  if (kind === 'png' && (buffer.length < 45 || buffer.toString('ascii',12,16) !== 'IHDR' || buffer.toString('ascii',buffer.length-8,buffer.length-4) !== 'IEND')) throw new Error('PNG文件结构不完整');
  if (kind === 'jpeg' && (buffer[buffer.length-2] !== 0xff || buffer[buffer.length-1] !== 0xd9)) throw new Error('JPEG文件结构不完整');
  if (kind === 'webp' && (buffer.length < 30 || buffer.readUInt32LE(4) !== buffer.length-8)) throw new Error('WebP文件结构不完整');
  // Bound raster dimensions without installing a decoder or executing third-party tools.
  let dimensions:{width:number;height:number}|null=null;
  if(kind==='png'){
    if(buffer.readUInt32BE(8)!==13)throw new Error('PNG头无效');
    dimensions={width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};
  }else if(kind==='jpeg'){
    let offset=2;
    while(offset+4<buffer.length){
      if(buffer[offset++]!==0xff)break;
      while(buffer[offset]===0xff)offset++;
      const marker=buffer[offset++];if(marker===undefined||marker===0xda||marker===0xd9)break;
      if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      if(offset+2>buffer.length)break;
      const length=buffer.readUInt16BE(offset);if(length<2||offset+length>buffer.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8){dimensions={height:buffer.readUInt16BE(offset+3),width:buffer.readUInt16BE(offset+5)};break;}
      offset+=length;
    }
  }else{
    const chunk=buffer.toString('ascii',12,16);
    if(chunk==='VP8X'&&buffer.length>=30)dimensions={width:1+buffer.readUIntLE(24,3),height:1+buffer.readUIntLE(27,3)};
    if(chunk==='VP8 '&&buffer.length>=30&&buffer.subarray(23,26).equals(Buffer.from([0x9d,0x01,0x2a])))dimensions={width:buffer.readUInt16LE(26)&0x3fff,height:buffer.readUInt16LE(28)&0x3fff};
    if(chunk==='VP8L'&&buffer.length>=25&&buffer[20]===0x2f){const bits=buffer.readUInt32LE(21);dimensions={width:1+(bits&0x3fff),height:1+((bits>>>14)&0x3fff)};}
  }
  if(!dimensions||!dimensions.width||!dimensions.height||dimensions.width>8192||dimensions.height>8192||dimensions.width*dimensions.height>16777216)throw new Error('图片尺寸过大或文件结构无效');

  const nameExt = extname(originalName).toLowerCase();
  if (!OFFICIAL_AVATAR_EXT.has(nameExt)) {
    throw new Error('仅支持 PNG、JPEG、WebP 头像');
  }
  if (nameExt === '.png' && kind !== 'png') throw new Error('扩展名与文件内容不符');
  if ((nameExt === '.jpg' || nameExt === '.jpeg') && kind !== 'jpeg') {
    throw new Error('扩展名与文件内容不符');
  }
  if (nameExt === '.webp' && kind !== 'webp') throw new Error('扩展名与文件内容不符');
  if (mime === 'image/png' && kind !== 'png') throw new Error('声明的图片类型与文件内容不符');
  if ((mime === 'image/jpeg' || mime === 'image/jpg') && kind !== 'jpeg') {
    throw new Error('声明的图片类型与文件内容不符');
  }
  if (mime === 'image/webp' && kind !== 'webp') throw new Error('声明的图片类型与文件内容不符');
  return { kind, ext: extForOfficialAvatarKind(kind) };
}

/** Persist a unique per-agent official avatar under uploads/official-avatars/. */
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
  const { ext } = assertOfficialAvatarUpload(originalName, buffer, mimetype);
  const fileName = `${randomUUID()}${ext}`;
  const rel = `${OFFICIAL_AVATAR_DIR}/${fileName}`;
  const abs = join(uploadRoot(), OFFICIAL_AVATAR_DIR, fileName);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return rel;
}

export function officialAvatarUploadDir() {
  return join(uploadRoot(), OFFICIAL_AVATAR_DIR);
}


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
