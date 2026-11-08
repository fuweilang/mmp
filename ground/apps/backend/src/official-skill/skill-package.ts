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
  references?: SkillReference[];
};

export type ParsedSkillPackage = {
  manifest: SkillManifest;
  instruction: string;
  /** relative paths under package root → file bytes */
  files: Map<string, Buffer>;
  resourceCount: number;
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
    throw skillPackageError('SKILL_PACKAGE_INVALID', `用途不能超过 ${SKILL_SUMMARY_MAX_CHARS} 个字符`);
  }
  return text;
}

function normalizeZipPath(raw: string): string | null {
  const replaced = String(raw || '').replace(/\\/g, '/').trim();
  if (!replaced || replaced.endsWith('/')) return null;
  if (replaced.startsWith('/') || /^[a-zA-Z]:/.test(replaced)) return null;
  const parts = replaced.split('/').filter((part) => part.length > 0);
  if (parts.some((part) => part === '.' || part === '..')) return null;
  return parts.join('/');
}

function extOf(path: string) {
  const base = path.split('/').pop() || '';
  const idx = base.lastIndexOf('.');
  if (idx < 0) return '';
  return base.slice(idx).toLowerCase();
}

function detectPackageRoot(paths: string[]): { rootPrefix: string; files: string[] } {
  const normalized = paths.map((p) => normalizeZipPath(p)).filter((p): p is string => Boolean(p));
  if (!normalized.length) throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');

  const hasFlat = normalized.some((p) => p === 'skill.json' || p === 'SKILL.md');
  if (hasFlat) {
    return { rootPrefix: '', files: normalized };
  }

  const tops = [...new Set(normalized.map((p) => p.split('/')[0]))];
  if (tops.length !== 1) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
  }
  const root = tops[0];
  const files = normalized
    .filter((p) => p.startsWith(`${root}/`))
    .map((p) => p.slice(root.length + 1))
    .filter(Boolean);
  return { rootPrefix: root, files };
}

async function readZipEntries(buffer: Buffer) {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(buffer, { createFolders: false });
  } catch {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
  }
  const entries: Array<{ path: string; file: JSZip.JSZipObject }> = [];
  let uncompressed = 0;
  archive.forEach((relativePath, file) => {
    if (file.dir) return;
    // JSZip does not materialize symlinks as special; reject absolute / traversal via path rules.
    const path = normalizeZipPath(relativePath);
    if (!path) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
    }
    entries.push({ path: relativePath.replace(/\\/g, '/'), file });
  });
  if (entries.length > SKILL_PACKAGE_MAX_FILES) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包文件数量超过限制');
  }
  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    const data = Buffer.from(await entry.file.async('nodebuffer'));
    uncompressed += data.length;
    if (uncompressed > SKILL_PACKAGE_MAX_UNCOMPRESSED) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包解压后超过 10MB 限制');
    }
    const path = normalizeZipPath(entry.path);
    if (!path) throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
    if (files.has(path)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包存在重复文件');
    }
    files.set(path, data);
  }
  return files;
}

function parseManifest(raw: Buffer): SkillManifest {
  let json: unknown;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
  }
  const obj = json as Record<string, unknown>;
  const key = assertSkillKey(String(obj.key ?? ''));
  const name = assertSkillDisplayName(String(obj.name ?? ''));
  const description = assertSkillSummary(String(obj.description ?? obj.summary ?? ''));
  const entry = String(obj.entry ?? 'SKILL.md').trim();
  if (entry !== 'SKILL.md') {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
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
        throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
      }
      references.push({ path });
    }
  }
  return { key, name, description, entry: 'SKILL.md', category, references: references.length ? references : undefined };
}

/**
 * Parse and validate a managed skill ZIP into a normalized in-memory package.
 * Accepts either flat root or a single top-level directory (optionally matching key).
 * Maps resources/* → references/* for storage/manifest consistency.
 */
export async function parseSkillZip(buffer: Buffer): Promise<ParsedSkillPackage> {
  if (!buffer?.length) throw skillPackageError('SKILL_PACKAGE_INVALID', '请选择技能包');
  const rawFiles = await readZipEntries(buffer);
  const { rootPrefix } = detectPackageRoot([...rawFiles.keys()]);
  const rooted = new Map<string, Buffer>();
  for (const [rawPath, data] of rawFiles) {
    const norm = normalizeZipPath(rawPath);
    if (!norm) continue;
    let rel = norm;
    if (rootPrefix) {
      if (norm === rootPrefix) continue;
      if (!norm.startsWith(`${rootPrefix}/`)) continue;
      rel = norm.slice(rootPrefix.length + 1);
    }
    rooted.set(rel, data);
  }

  const manifestBuf = rooted.get('skill.json');
  if (!manifestBuf) throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
  const manifest = parseManifest(manifestBuf);
  if (rootPrefix && rootPrefix !== manifest.key) {
    // Spec: optional single top dir named as key; other single dirs still accepted if package valid.
  }

  const skillMd = rooted.get('SKILL.md');
  if (!skillMd) throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
  if (skillMd.length > SKILL_MD_MAX_BYTES) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能说明文件过大');
  }
  const instruction = skillMd.toString('utf8');
  if (!instruction.trim()) throw skillPackageError('SKILL_PACKAGE_INVALID', '技能说明不能为空');

  const outFiles = new Map<string, Buffer>();
  outFiles.set('skill.json', Buffer.from(JSON.stringify({
    key: manifest.key,
    name: manifest.name,
    description: manifest.description,
    entry: 'SKILL.md',
    ...(manifest.category ? { category: manifest.category } : {}),
    ...(manifest.references?.length ? { references: manifest.references } : {}),
  }, null, 2), 'utf8'));
  outFiles.set('SKILL.md', skillMd);

  // Collect resources/ → references/
  const resourceFiles: Array<{ rel: string; data: Buffer }> = [];
  for (const [rel, data] of rooted) {
    if (rel === 'skill.json' || rel === 'SKILL.md') continue;
    if (rel.startsWith('resources/')) {
      const rest = rel.slice('resources/'.length);
      if (!rest || rest.includes('..')) {
        throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
      }
      resourceFiles.push({ rel: `references/${rest}`, data });
      continue;
    }
    if (rel.startsWith('references/')) {
      resourceFiles.push({ rel, data });
      continue;
    }
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
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
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包包含不支持的文件类型');
    }
    outFiles.set(item.rel, item.data);
  }

  // If manifest declares references, every declared path must exist; undeclared resources are allowed and folded into manifest.
  for (const path of declared) {
    if (!outFiles.has(path)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包无法识别，请换一个包再试');
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
  outFiles.set(
    'skill.json',
    Buffer.from(
      JSON.stringify(
        {
          key: finalManifest.key,
          name: finalManifest.name,
          description: finalManifest.description,
          entry: 'SKILL.md',
          ...(finalManifest.category ? { category: finalManifest.category } : {}),
          ...(finalManifest.references ? { references: finalManifest.references } : {}),
        },
        null,
        2,
      ),
      'utf8',
    ),
  );

  return {
    manifest: finalManifest,
    instruction,
    files: outFiles,
    resourceCount: references.length,
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
  if (!instruction.trim()) throw skillPackageError('SKILL_PACKAGE_INVALID', '技能说明不能为空');
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
  files.set(
    'skill.json',
    Buffer.from(
      JSON.stringify(
        {
          key,
          name,
          description,
          entry: 'SKILL.md',
          ...(category ? { category } : {}),
        },
        null,
        2,
      ),
      'utf8',
    ),
  );
  files.set('SKILL.md', instructionBuf);
  return { manifest, instruction, files, resourceCount: 0 };
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
  };
}
