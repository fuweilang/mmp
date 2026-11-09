import { HttpException, HttpStatus } from '@nestjs/common';
import JSZip from 'jszip';
import { mkdir, writeFile, rm } from 'fs/promises';
import { dirname, join, posix } from 'path';
import { officialSkillPackageRelDir, uploadRoot } from '../knowledge/storage';

export const SKILL_PACKAGE_MAX_UNCOMPRESSED = 10 * 1024 * 1024;
export const SKILL_PACKAGE_MAX_FILES = 50;
export const SKILL_MD_MAX_BYTES = 100 * 1024;
export const SKILL_RESOURCE_MAX_BYTES = 1 * 1024 * 1024;
export const SKILL_NAME_MAX_CHARS = 40;
export const SKILL_SUMMARY_MAX_CHARS = 140;

const ALLOWED_RESOURCE_EXT = new Set([
  '.md',
  '.txt',
  '.json',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

export const OFFICIAL_SKILL_CATEGORIES = ['common', 'content', 'analytics', 'office', 'education', 'expertise', 'business', 'ecommerce', 'sales', 'hr', 'legal', 'finance', 'consulting', 'research', 'files', 'search', 'writing', 'lifestyle'] as const;
export type OfficialSkillCategoryKey = (typeof OFFICIAL_SKILL_CATEGORIES)[number];

/** Keep pre-industry Host bundles usable; industry-aware directories opt in explicitly. */
export function legacySkillCategory(category: string | null): 'common' | 'content' | 'business' | 'expertise' | null {
  if (category === null) return null;
  if (category === 'common' || category === 'content' || category === 'business' || category === 'expertise') return category;
  if (['ecommerce', 'sales', 'hr', 'consulting'].includes(category)) return 'business';
  if (['analytics', 'legal', 'finance', 'research'].includes(category)) return 'expertise';
  if (category === 'writing') return 'content';
  return 'common';
}


export type SkillReference = { path: string };
export type SkillManifest = {
  key: string;
  name: string;
  description: string;
  entry: 'SKILL.md';
  category?: OfficialSkillCategoryKey;
  /** Preserved import metadata. Not execution content. */
  license?: string;
  source?: string;
  references?: SkillReference[];
};

export type ParsedSkillPackage = {
  manifest: SkillManifest;
  instruction: string;
  /** relative paths under package root → file bytes */
  files: Map<string, Buffer>;
  resourceCount: number;
  /** True when the package had no explicit skill.json key. */
  keyDerived: boolean;
};

export function isOfficialSkillCategory(value: unknown): value is OfficialSkillCategoryKey {
  return typeof value === 'string' && (OFFICIAL_SKILL_CATEGORIES as readonly string[]).includes(value);
}

export function skillPackageError(code: string, message: string, status: number = HttpStatus.BAD_REQUEST) {
  return new HttpException({ code, message, statusCode: status }, status);
}

const KEY_RE = /^[a-z][a-z0-9-]{1,63}$/;

export function assertSkillKey(key: string) {
  const text = String(key || '').trim();
  if (!KEY_RE.test(text)) {
    throw skillPackageError(
      'SKILL_PACKAGE_INVALID',
      '标识需以小写字母开头，只能包含小写字母、数字和连字符',
    );
  }
  return text;
}

export function assertSkillDisplayName(name: string) {
  const text = String(name || '').trim();
  if (!text) throw skillPackageError('SKILL_PACKAGE_INVALID', '名称不能为空');
  if ([...text].length > SKILL_NAME_MAX_CHARS) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', `名称不能超过 ${SKILL_NAME_MAX_CHARS} 个字符`);
  }
  return text;
}

export function assertSkillSummary(summary: string) {
  const text = String(summary || '').trim();
  if ([...text].length > SKILL_SUMMARY_MAX_CHARS) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', `一句话介绍不能超过 ${SKILL_SUMMARY_MAX_CHARS} 个字符`);
  }
  return text;
}

/** ASCII slug for an auto key. Chinese and other non-latin names return null. */
export function slugSkillKey(input: string): string | null {
  const ascii = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48);
  if (!ascii || !/^[a-z]/.test(ascii)) return null;
  const key = ascii.length === 1 ? `${ascii}x` : ascii;
  return KEY_RE.test(key) ? key : null;
}

const IGNORED_ZIP_DIRS = new Set(['__MACOSX', '.git', '.svn', '.hg']);

/** Finder and archive junk that must not become a second package root. */
export function isIgnorableZipPath(path: string): boolean {
  const parts = String(path || '').split('/');
  const base = parts[parts.length - 1] || '';
  if (parts.some((part) => IGNORED_ZIP_DIRS.has(part))) return true;
  if (base === '.DS_Store' || base === 'Thumbs.db' || base === 'desktop.ini') return true;
  if (base.startsWith('._')) return true;
  return false;
}

function normalizeZipPath(raw: string): string | null {
  const replaced = String(raw || '').replace(/\\/g, '/').trim();
  if (!replaced || replaced.endsWith('/') || replaced.includes('\0')) return null;
  if (replaced.startsWith('/') || /^[a-zA-Z]:/.test(replaced)) return null;
  const parts = replaced.split('/').filter((part) => part.length > 0);
  if (parts.some((part) => part === '.' || part === '..')) return null;
  return parts.join('/');
}

function clipChars(value: string, max: number) {
  return [...String(value || '').trim()].slice(0, max).join('');
}

/** Read only flat `key: value` frontmatter. Does not evaluate YAML. */
export function readSkillFrontmatter(markdown: string): {
  name?: string;
  description?: string;
  license?: string;
} {
  const text = String(markdown || '').replace(/^\uFEFF/, '');
  const found: { name?: string; description?: string; license?: string } = {};
  const licenseComment = /License:\s*([A-Za-z0-9.+-]{1,80})/.exec(text.slice(0, 800));
  if (licenseComment?.[1]) found.license = licenseComment[1];
  if (!text.startsWith('---')) return found;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return found;
  const block = text.slice(3, end);
  for (const line of block.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim();
    }
    if (!value) continue;
    const key = match[1].toLowerCase();
    if (key === 'name') found.name = value;
    if (key === 'description') found.description = value;
    if (key === 'license') found.license = value;
  }
  return found;
}

function manifestRecord(manifest: SkillManifest): Record<string, unknown> {
  return {
    key: manifest.key,
    name: manifest.name,
    description: manifest.description,
    entry: 'SKILL.md',
    ...(manifest.category ? { category: manifest.category } : {}),
    ...(manifest.license ? { license: manifest.license } : {}),
    ...(manifest.source ? { source: manifest.source } : {}),
    ...(manifest.references?.length ? { references: manifest.references } : {}),
  };
}

function writeManifestFile(files: Map<string, Buffer>, manifest: SkillManifest) {
  files.set('skill.json', Buffer.from(JSON.stringify(manifestRecord(manifest), null, 2), 'utf8'));
}

/** Point a derived package at the skill key that will actually be stored. */
export function retargetPackageKey(parsed: ParsedSkillPackage, key: string) {
  parsed.manifest.key = assertSkillKey(key);
  parsed.keyDerived = false;
  writeManifestFile(parsed.files, parsed.manifest);
}

function extOf(path: string) {
  const base = path.split('/').pop() || '';
  const idx = base.lastIndexOf('.');
  if (idx < 0) return '';
  return base.slice(idx).toLowerCase();
}

/** Directory that contains the single executable SKILL.md, after junk is ignored. */
export function locateSkillPackageRoot(paths: string[]): string {
  const skillMds = paths.filter((path) => path === 'SKILL.md' || path.endsWith('/SKILL.md'));
  const primary = skillMds.filter((path) => !/(^|\/)(references|resources)\//.test(path));
  if (!primary.length) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包缺少 SKILL.md');
  }
  if (primary.length > 1) {
    throw skillPackageError(
      'SKILL_PACKAGE_INVALID',
      '技能包有多个 SKILL.md 入口，无法确定使用哪一个',
    );
  }
  const only = primary[0]!;
  return only === 'SKILL.md' ? '' : only.slice(0, -'/SKILL.md'.length);
}

async function readZipEntries(buffer: Buffer) {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(buffer, { createFolders: false });
  } catch {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包已损坏，无法解压');
  }
  const entries: Array<{ path: string; file: JSZip.JSZipObject }> = [];
  archive.forEach((relativePath, file) => {
    if (file.dir) return;
    const path = normalizeZipPath(relativePath);
    if (!path) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包包含不安全路径');
    }
    if (isIgnorableZipPath(path)) return;
    entries.push({ path, file });
  });
  if (entries.length > SKILL_PACKAGE_MAX_FILES) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包文件数量超过限制');
  }
  let uncompressed = 0;
  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    const data = Buffer.from(await entry.file.async('nodebuffer'));
    uncompressed += data.length;
    if (uncompressed > SKILL_PACKAGE_MAX_UNCOMPRESSED) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包解压后超过 10MB 限制');
    }
    if (files.has(entry.path)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包存在重复文件');
    }
    files.set(entry.path, data);
  }
  return files;
}

function parseManifest(raw: Buffer): SkillManifest {
  let json: unknown;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    throw skillPackageError('SKILL_PACKAGE_INVALID', 'skill.json 无法解析');
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', 'skill.json 无法解析');
  }
  const obj = json as Record<string, unknown>;
  let key: string;
  try {
    key = assertSkillKey(String(obj.key ?? ''));
  } catch {
    throw skillPackageError('SKILL_PACKAGE_INVALID', 'skill.json 的标识无效');
  }
  const name = assertSkillDisplayName(String(obj.name ?? ''));
  const description = assertSkillSummary(String(obj.description ?? obj.summary ?? ''));
  const entry = String(obj.entry ?? 'SKILL.md').trim();
  if (entry !== 'SKILL.md') {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包入口必须是 SKILL.md');
  }
  let category: OfficialSkillCategoryKey | undefined;
  if (obj.category !== undefined && obj.category !== null && String(obj.category).trim()) {
    if (!isOfficialSkillCategory(obj.category)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '分类不在允许范围内');
    }
    category = obj.category;
  }
  const references: SkillReference[] = [];
  if (obj.references !== undefined) {
    if (!Array.isArray(obj.references)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
    }
    for (const item of obj.references) {
      if (!item || typeof item !== 'object') {
        throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
      }
      const path = normalizeZipPath(String((item as { path?: unknown }).path ?? ''));
      if (!path || !path.startsWith('references/')) {
        throw skillPackageError('SKILL_PACKAGE_INVALID', 'skill.json 引用了不存在的 references 路径');
      }
      references.push({ path });
    }
  }
  const license = optionalMeta(obj.license, 80);
  const source = optionalMeta(obj.source, 200);
  return {
    key,
    name,
    description,
    entry: 'SKILL.md',
    category,
    ...(license ? { license } : {}),
    ...(source ? { source } : {}),
    references: references.length ? references : undefined,
  };
}

function optionalMeta(value: unknown, max: number) {
  if (typeof value !== 'string') return undefined;
  const text = clipChars(value, max);
  return text || undefined;
}

/**
 * Parse and validate a managed skill ZIP into a normalized in-memory package.
 * Accepts either flat root or a single top-level directory (optionally matching key).
 * Maps resources/* → references/* for storage/manifest consistency.
 */
export async function parseSkillZip(buffer: Buffer): Promise<ParsedSkillPackage> {
  if (!buffer?.length) throw skillPackageError('SKILL_PACKAGE_INVALID', '请选择技能包');
  const rawFiles = await readZipEntries(buffer);
  const rootPrefix = locateSkillPackageRoot([...rawFiles.keys()]);
  const rooted = new Map<string, Buffer>();
  for (const [norm, data] of rawFiles) {
    if (!rootPrefix) {
      rooted.set(norm, data);
      continue;
    }
    if (norm === rootPrefix) continue;
    if (!norm.startsWith(`${rootPrefix}/`)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包包含技能目录以外的文件');
    }
    rooted.set(norm.slice(rootPrefix.length + 1), data);
  }

  const skillMd = rooted.get('SKILL.md');
  if (!skillMd) throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包缺少 SKILL.md');
  if (skillMd.length > SKILL_MD_MAX_BYTES) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', 'SKILL.md 超过 100KB');
  }
  const instruction = skillMd.toString('utf8');
  if (!instruction.trim()) throw skillPackageError('SKILL_PACKAGE_INVALID', 'SKILL.md 内容为空');

  const frontmatter = readSkillFrontmatter(instruction);
  const manifestBuf = rooted.get('skill.json');
  let manifest: SkillManifest;
  let keyDerived = false;
  if (manifestBuf) {
    manifest = parseManifest(manifestBuf);
  } else {
    keyDerived = true;
    const folder = rootPrefix.split('/').filter(Boolean).pop() || '';
    const heading = /^#\s+(.+)$/m.exec(instruction)?.[1]?.trim() || '';
    const name = clipChars(frontmatter.name || heading || folder || '未命名技能', SKILL_NAME_MAX_CHARS);
    const description = clipChars(frontmatter.description || '', SKILL_SUMMARY_MAX_CHARS);
    const key = slugSkillKey(frontmatter.name || folder || name) || 'skill-import';
    manifest = {
      key,
      name: assertSkillDisplayName(name),
      description: assertSkillSummary(description),
      entry: 'SKILL.md',
      ...(frontmatter.license ? { license: clipChars(frontmatter.license, 80) } : {}),
    };
  }
  if (!manifest.license && frontmatter.license) {
    manifest = { ...manifest, license: clipChars(frontmatter.license, 80) };
  }

  const outFiles = new Map<string, Buffer>();
  outFiles.set('SKILL.md', skillMd);

  // Collect resources/ → references/
  const resourceFiles: Array<{ rel: string; data: Buffer }> = [];
  for (const [rel, data] of rooted) {
    if (rel === 'skill.json' || rel === 'SKILL.md') continue;
    if (rel.startsWith('resources/')) {
      const rest = rel.slice('resources/'.length);
      if (!rest || rest.includes('..')) {
        throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包包含不安全路径');
      }
      resourceFiles.push({ rel: `references/${rest}`, data });
      continue;
    }
    if (rel.startsWith('references/')) {
      resourceFiles.push({ rel, data });
      continue;
    }
    throw skillPackageError('SKILL_PACKAGE_INVALID', `技能包包含无法识别的文件：${rel}`);
  }

  const declared = new Set((manifest.references ?? []).map((r) => r.path));
  const seen = new Set<string>();
  for (const item of resourceFiles) {
    if (seen.has(item.rel)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包存在重复文件');
    }
    seen.add(item.rel);
    if (item.data.length > SKILL_RESOURCE_MAX_BYTES) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '引用资源单文件不能超过 1MB');
    }
    const ext = extOf(item.rel);
    if (!ALLOWED_RESOURCE_EXT.has(ext)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', `技能包包含不支持的文件类型：${item.rel}`);
    }
    outFiles.set(item.rel, item.data);
  }

  // If manifest declares references, every declared path must exist; undeclared resources are allowed and folded into manifest.
  for (const path of declared) {
    if (!outFiles.has(path)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', `技能包声明的文件不存在：${path}`);
    }
  }
  const references = [...outFiles.keys()]
    .filter((p) => p.startsWith('references/'))
    .sort()
    .map((path) => ({ path }));
  const finalManifest: SkillManifest = {
    ...manifest,
    references: references.length ? references : undefined,
  };
  writeManifestFile(outFiles, finalManifest);

  return {
    manifest: finalManifest,
    instruction,
    files: outFiles,
    resourceCount: references.length,
    keyDerived,
  };
}

/** Build equivalent package from admin form fields (no ZIP). */
export function buildSkillPackageFromForm(input: {
  key: string;
  name: string;
  summary: string;
  category?: OfficialSkillCategoryKey | null;
  instruction: string;
}): ParsedSkillPackage {
  const key = assertSkillKey(input.key);
  const name = assertSkillDisplayName(input.name);
  const description = assertSkillSummary(input.summary);
  const instruction = String(input.instruction || '');
  if (!instruction.trim()) throw skillPackageError('SKILL_PACKAGE_INVALID', '技能指令不能为空');
  const instructionBuf = Buffer.from(instruction, 'utf8');
  if (instructionBuf.length > SKILL_MD_MAX_BYTES) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能说明文件过大');
  }
  let category: OfficialSkillCategoryKey | undefined;
  if (input.category) {
    if (!isOfficialSkillCategory(input.category)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '分类不在允许范围内');
    }
    category = input.category;
  }
  const manifest: SkillManifest = {
    key,
    name,
    description,
    entry: 'SKILL.md',
    category,
  };
  const files = new Map<string, Buffer>();
  files.set('SKILL.md', instructionBuf);
  writeManifestFile(files, manifest);
  return { manifest, instruction, files, resourceCount: 0, keyDerived: false };
}

/** Persist parsed package under uploads/; returns relative storagePath (directory). */
export async function writeSkillPackageToDisk(
  skillId: string,
  revision: number,
  parsed: ParsedSkillPackage,
  sourceZip?: Buffer,
): Promise<{ storagePath: string; sourceZipPath: string | null }> {
  const relDir = officialSkillPackageRelDir(skillId, revision);
  const absDir = join(uploadRoot(), relDir);
  await rm(absDir, { recursive: true, force: true });
  await mkdir(absDir, { recursive: true });
  for (const [rel, data] of parsed.files) {
    const safeRel = normalizeZipPath(rel);
    if (!safeRel) throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包路径不安全');
    const abs = join(absDir, ...safeRel.split('/'));
    // Ensure still under absDir
    if (!abs.startsWith(absDir)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包路径不安全');
    }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, data);
  }
  let sourceZipPath: string | null = null;
  if (sourceZip?.length) {
    sourceZipPath = posix.join(relDir.replace(/\\/g, '/'), 'package.zip');
    await writeFile(join(absDir, 'package.zip'), sourceZip);
  }
  return { storagePath: relDir.replace(/\\/g, '/'), sourceZipPath };
}

export function packagePreview(parsed: ParsedSkillPackage) {
  return {
    key: parsed.manifest.key,
    name: parsed.manifest.name,
    summary: parsed.manifest.description,
    category: parsed.manifest.category ?? null,
    resourceCount: parsed.resourceCount,
    instructionBytes: Buffer.byteLength(parsed.instruction, 'utf8'),
    keyDerived: parsed.keyDerived,
    license: parsed.manifest.license ?? null,
    source: parsed.manifest.source ?? null,
  };
}
