import { HttpException, HttpStatus } from '@nestjs/common';
import { parseDocument } from 'yaml';
import { readSkillZip } from './skill-zip';
import { indexSkillFiles, isSkillPackagePath, skillPackageDigest, skillPackageLimits, skillPackageStats, type SkillPackageFile, type SkillPackageLimits } from './skill-package-format';
import { mkdir, writeFile, rm } from 'fs/promises';
import { dirname, join, posix } from 'path';
import { officialSkillPackageRelDir, uploadRoot } from '../knowledge/storage';

export const SKILL_PACKAGE_MAX_UNCOMPRESSED = 10 * 1024 * 1024;
export const SKILL_PACKAGE_MAX_FILES = 500;
export const SKILL_MD_MAX_BYTES = 100 * 1024;
export const SKILL_RESOURCE_MAX_BYTES = 1 * 1024 * 1024;
export const SKILL_NAME_MAX_CHARS = 40;
export const SKILL_SUMMARY_MAX_CHARS = 140;

export const OFFICIAL_SKILL_CATEGORIES = ['common', 'content', 'analytics', 'office', 'education', 'expertise', 'business', 'ecommerce', 'sales', 'hr', 'legal', 'finance', 'consulting', 'research', 'files', 'search', 'writing', 'lifestyle'] as const;
export type OfficialSkillCategoryKey = (typeof OFFICIAL_SKILL_CATEGORIES)[number];
export const MAX_SKILL_CATEGORIES = 3;

export function primarySkillCategory(categories: readonly OfficialSkillCategoryKey[]): OfficialSkillCategoryKey | null {
  return categories[0] ?? null;
}

function categoryTokens(input: unknown): unknown[] {
  if (input == null || input === '') return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text) as unknown;
        return Array.isArray(parsed) ? parsed : [text];
      } catch {
        throw skillPackageError('SKILL_PACKAGE_INVALID', '分类不在允许范围内');
      }
    }
    return text.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [input];
}

/** Unique categories, max 3. Accepts a string, JSON array, comma list, or string[]. */
export function parseSkillCategories(input: unknown): OfficialSkillCategoryKey[] {
  const out: OfficialSkillCategoryKey[] = [];
  const seen = new Set<OfficialSkillCategoryKey>();
  for (const token of categoryTokens(input)) {
    if (token == null || token === '') continue;
    if (!isOfficialSkillCategory(token)) {
      throw skillPackageError('SKILL_PACKAGE_INVALID', '分类不在允许范围内');
    }
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  if (out.length > MAX_SKILL_CATEGORIES) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '分类最多 3 个');
  }
  return out;
}

export function categoriesFromManifest(obj: Record<string, unknown>): OfficialSkillCategoryKey[] {
  return parseSkillCategories([
    ...(obj.category !== undefined && obj.category !== null && String(obj.category).trim() ? [obj.category] : []),
    ...categoryTokens(obj.categories),
  ]);
}

export function assignManifestCategories(manifest: SkillManifest, categories: OfficialSkillCategoryKey[]) {
  const next = parseSkillCategories(categories);
  if (next.length) {
    manifest.category = next[0];
    if (next.length > 1) manifest.categories = next;
    else delete manifest.categories;
  } else {
    delete manifest.category;
    delete manifest.categories;
  }
}

export function storedCategories(manifest: SkillManifest): OfficialSkillCategoryKey[] {
  return parseSkillCategories(manifest.categories?.length ? manifest.categories : (manifest.category ?? []));
}

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
  categories?: OfficialSkillCategoryKey[];
  /** Preserved import metadata. Not execution content. */
  license?: string;
  source?: string;
  references?: SkillReference[];
  packageFormat?: 2;
  files?: SkillPackageFile[];
  packageDigest?: string;
  limits?: SkillPackageLimits;
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

/** Read inert YAML display metadata while preserving the original Markdown bytes. */
export function readSkillFrontmatter(markdown: string): { name?: string; description?: string; license?: string } {
  const text = String(markdown || '').replace(/^\uFEFF/, '');
  const found: { name?: string; description?: string; license?: string } = {};
  const licenseComment = /License:\s*([A-Za-z0-9.+-]{1,80})/.exec(text.slice(0, 800));
  if (licenseComment?.[1]) found.license = licenseComment[1];
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) {
    if (text.startsWith('---')) throw skillPackageError('SKILL_PACKAGE_INVALID', 'SKILL.md 的 YAML 说明头未闭合');
    return found;
  }
  try {
    const document = parseDocument(match[1], { schema: 'core', customTags: [], resolveKnownTags: false });
    if (document.errors.length || document.warnings.length) throw new Error(document.errors[0]?.message || document.warnings[0]?.message);
    const value: unknown = document.toJS({ maxAliasCount: 10 });
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('说明头必须是字段对象');
    const record = value as Record<string, unknown>;
    for (const key of ['name', 'description', 'license'] as const) {
      if (record[key] !== undefined && typeof record[key] !== 'string') throw new Error(`${key} 必须是文本`);
      if (typeof record[key] === 'string' && record[key].trim()) found[key] = record[key].trim();
    }
    return found;
  } catch (error) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', `SKILL.md 的 YAML 格式错误：${error instanceof Error ? error.message : '无法解析'}`);
  }
}

function manifestRecord(manifest: SkillManifest): Record<string, unknown> {
  return {
    key: manifest.key,
    name: manifest.name,
    description: manifest.description,
    entry: 'SKILL.md',
    ...(manifest.category ? { category: manifest.category } : {}),
    ...(manifest.categories && manifest.categories.length > 1 ? { categories: manifest.categories } : {}),
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
  if (parsed.manifest.packageFormat !== 2) writeManifestFile(parsed.files, parsed.manifest);
}

function extOf(path: string) {
  const base = path.split('/').pop() || '';
  const idx = base.lastIndexOf('.');
  if (idx < 0) return '';
  return base.slice(idx).toLowerCase();
}

/** Directory that contains the single executable SKILL.md, after junk is ignored. */
export function locateSkillPackageRoot(paths: string[]): string {
  if (paths.includes('SKILL.md')) return '';
  const candidates = paths.filter(path => path.endsWith('/SKILL.md'));
  if (!candidates.length) throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包缺少 SKILL.md');
  const roots = candidates.map(path => path.slice(0, -'/SKILL.md'.length));
  const primary = roots.filter(root => paths.every(path => path.startsWith(`${root}/`)));
  if (primary.length !== 1) throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包有多个 SKILL.md 入口，请选择一个技能单独上传');
  return primary[0]!;
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
  const categories = categoriesFromManifest(obj);
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
      if (!path || !isSkillPackagePath(path)) {
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
    ...(categories[0] ? { category: categories[0] } : {}),
    ...(categories.length > 1 ? { categories } : {}),
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

/** Parse a complete, bounded single-skill ZIP without rewriting any admitted file. */
export async function parseSkillZip(buffer: Buffer): Promise<ParsedSkillPackage> {
  if (!buffer?.length) throw skillPackageError('SKILL_PACKAGE_INVALID', '请选择技能包');
  const limits = skillPackageLimits();
  const archive = await readSkillZip(buffer, limits);
  const rootPrefix = locateSkillPackageRoot([...archive.files.keys()]);
  const files = new Map<string, Buffer>(), executable = new Set<string>();
  for (const [path, bytes] of archive.files) {
    const relative = rootPrefix ? path.slice(rootPrefix.length + 1) : path;
    files.set(relative, bytes);
    if (archive.executable.has(path)) executable.add(relative);
  }
  const skillMd = files.get('SKILL.md');
  if (!skillMd) throw skillPackageError('SKILL_PACKAGE_INVALID', '技能包缺少 SKILL.md');
  if (skillMd.length > limits.maxInstructionBytes) throw skillPackageError('SKILL_PACKAGE_INVALID', 'SKILL.md 超过 100KB 限制');
  let instruction: string;
  try { instruction = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(skillMd); }
  catch { throw skillPackageError('SKILL_PACKAGE_INVALID', 'SKILL.md 必须是 UTF-8 文本'); }
  if (!instruction.trim()) throw skillPackageError('SKILL_PACKAGE_INVALID', 'SKILL.md 内容为空');
  const frontmatter = readSkillFrontmatter(instruction);
  const sourceManifest = files.get('skill.json');
  let manifest: SkillManifest | undefined;
  if (sourceManifest) {
    let value: unknown;
    try { value = JSON.parse(sourceManifest.toString('utf8')); }
    catch { throw skillPackageError('SKILL_PACKAGE_INVALID', 'skill.json 无法解析'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw skillPackageError('SKILL_PACKAGE_INVALID', 'skill.json 必须是 JSON 对象');
    const obj = value as Record<string, unknown>, owns = (key: string) => Object.prototype.hasOwnProperty.call(obj, key);
    if (owns('key') && owns('name') && (owns('description') || owns('summary')) && (obj.entry === undefined || obj.entry === 'SKILL.md')) {
      manifest = parseManifest(sourceManifest);
    }
  }
  const keyDerived = manifest === undefined;
  if (!manifest) {
    const folder = rootPrefix.split('/').pop() || '';
    const heading = /^#\s+(.+)$/m.exec(instruction)?.[1]?.trim() || '';
    const name = clipChars(frontmatter.name || heading || folder || '未命名技能', SKILL_NAME_MAX_CHARS);
    manifest = {
      key: slugSkillKey(frontmatter.name || folder || name) || 'skill-import',
      name: assertSkillDisplayName(name),
      description: assertSkillSummary(clipChars(frontmatter.description || '', SKILL_SUMMARY_MAX_CHARS)),
      entry: 'SKILL.md',
    };
  }
  if (!manifest.license && frontmatter.license) manifest.license = clipChars(frontmatter.license, 80);
  for (const reference of manifest.references ?? []) {
    if (!files.has(reference.path)) throw skillPackageError('SKILL_PACKAGE_INVALID', `技能包声明的文件不存在：${reference.path}`);
  }
  const index = indexSkillFiles(files, executable);
  Object.assign(manifest, {
    packageFormat: 2, files: index, packageDigest: skillPackageDigest(index), limits,
    references: index.filter(f => /^(references|resources)\//.test(f.path)).map(({ path }) => ({ path })),
  });
  return { manifest, instruction, files, resourceCount: index.length - 1, keyDerived };
}

/** Build equivalent package from admin form fields (no ZIP). */
export function buildSkillPackageFromForm(input: {
  key: string;
  name: string;
  summary: string;
  category?: OfficialSkillCategoryKey | null;
  categories?: OfficialSkillCategoryKey[] | null;
  instruction: string;
}): ParsedSkillPackage {
  const key = assertSkillKey(input.key);
  const name = assertSkillDisplayName(input.name);
  const description = assertSkillSummary(input.summary);
  const instruction = String(input.instruction || '');
  if (!instruction.trim()) throw skillPackageError('SKILL_PACKAGE_INVALID', '技能指令不能为空');
  const instructionBuf = Buffer.from(instruction, 'utf8');
  const limits = skillPackageLimits();
  if (instructionBuf.length > Math.min(limits.maxInstructionBytes, limits.maxTotalBytes)) {
    throw skillPackageError('SKILL_PACKAGE_INVALID', '技能说明文件过大');
  }
  const categories = parseSkillCategories(
    input.categories !== undefined && input.categories !== null ? input.categories : (input.category ?? []),
  );
  const manifest: SkillManifest = {
    key,
    name,
    description,
    entry: 'SKILL.md',
  };
  assignManifestCategories(manifest, categories);
  const files = new Map<string, Buffer>();
  files.set('SKILL.md', instructionBuf);
  const index = indexSkillFiles(files, new Set());
  Object.assign(manifest, { packageFormat: 2, files: index, packageDigest: skillPackageDigest(index), limits });
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
  const packageDir = join(uploadRoot(), relDir);
  const contentRelDir = parsed.manifest.packageFormat === 2 ? posix.join(relDir.replace(/\\/g, '/'), 'content') : relDir;
  const absDir = join(uploadRoot(), contentRelDir);
  await rm(absDir, { recursive: true, force: true });
  await mkdir(absDir, { recursive: true });
  for (const [rel, data] of parsed.files) {
    const safeRel = parsed.manifest.packageFormat === 2 ? (isSkillPackagePath(rel) ? rel : null) : normalizeZipPath(rel);
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
    await writeFile(join(packageDir, 'package.zip'), sourceZip);
  }
  return { storagePath: contentRelDir.replace(/\\/g, '/'), sourceZipPath };
}

export function packagePreview(parsed: ParsedSkillPackage) {
  return {
    key: parsed.manifest.key,
    name: parsed.manifest.name,
    summary: parsed.manifest.description,
    category: parsed.manifest.category ?? null,
    categories: storedCategories(parsed.manifest),
    resourceCount: parsed.resourceCount,
    ...(parsed.manifest.files ? skillPackageStats(parsed.manifest.files) : {}),
    instructionBytes: Buffer.byteLength(parsed.instruction, 'utf8'),
    keyDerived: parsed.keyDerived,
    license: parsed.manifest.license ?? null,
    source: parsed.manifest.source ?? null,
  };
}
