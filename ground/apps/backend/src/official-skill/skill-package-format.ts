import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';

/** Complete package file identity, relative to its SKILL.md directory. */
export type SkillPackageFile = { path: string; bytes: number; sha256: string; executable: boolean };
/** Resource bounds declared by a complete package revision. */
export type SkillPackageLimits = { maxFiles: number; maxTotalBytes: number; maxInstructionBytes: number };
/** Protocol ceilings also used as the default admission limits. */
export const SKILL_PACKAGE_LIMITS: SkillPackageLimits = Object.freeze({
  maxFiles: 500, maxTotalBytes: 10 * 1024 * 1024, maxInstructionBytes: 100 * 1024,
});
/** Maximum compressed upload size, independently of expansion bounds. */
export const SKILL_ZIP_MAX_BYTES = 12 * 1024 * 1024;

function invalid(message: string): never {
  throw new HttpException({ code: 'SKILL_PACKAGE_INVALID', message, statusCode: 400 }, 400);
}

/** Resolve optional deployment reductions without exceeding supported protocol ceilings. */
export function skillPackageLimits(): SkillPackageLimits {
  const resolve = (key: string, ceiling: number) => {
    const value = process.env[key];
    if (value === undefined) return ceiling;
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1 || n > ceiling) invalid(`${key} 配置无效`);
    return n;
  };
  return {
    maxFiles: resolve('MMP_SKILL_MAX_FILES', SKILL_PACKAGE_LIMITS.maxFiles),
    maxTotalBytes: resolve('MMP_SKILL_MAX_TOTAL_BYTES', SKILL_PACKAGE_LIMITS.maxTotalBytes),
    maxInstructionBytes: resolve('MMP_SKILL_MAX_INSTRUCTION_BYTES', SKILL_PACKAGE_LIMITS.maxInstructionBytes),
  };
}

/** Accept only unchanged, portable, relative paths suitable for all supported Hosts. */
export function isSkillPackagePath(path: string): boolean {
  if (!path || path.length > 512 || path.normalize('NFC') !== path || /[\\\x00-\x1f\x7f<>:"|?*]/.test(path)) return false;
  const parts = path.split('/');
  return parts.every(part => Boolean(part) && Buffer.byteLength(part, 'utf8') <= 255 && part !== '.' && part !== '..' && !/[. ]$/.test(part)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}

/** Verify path uniqueness including case-insensitive file/directory collisions. */
export function assertSkillFilePaths(paths: readonly string[]): void {
  const seen = new Set<string>();
  for (const path of paths) {
    if (!isSkillPackagePath(path)) invalid(`技能包包含不安全路径：${path}`);
    const key = path.toLowerCase();
    if (seen.has(key)) invalid(`技能包路径冲突：${path}`);
    seen.add(key);
  }
  for (const path of seen) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      if (seen.has(parts.slice(0, i).join('/'))) invalid(`技能包文件与目录路径冲突：${path}`);
    }
  }
  const directories = new Map<string, string>();
  for (const path of paths) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const directory = parts.slice(0, i).join('/'), key = directory.toLowerCase();
      if (directories.has(key) && directories.get(key) !== directory) invalid(`技能包目录路径冲突：${directory}`);
      directories.set(key, directory);
    }
  }
}

/** Canonical digest of sorted [path, bytes, SHA-256, executable] tuples. */
export function skillPackageDigest(files: readonly SkillPackageFile[]): string {
  const sorted = [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return createHash('sha256').update(JSON.stringify(sorted.map(f => [f.path, f.bytes, f.sha256, f.executable]))).digest('hex');
}

/** Construct the immutable index from exact admitted file bytes. */
export function indexSkillFiles(files: ReadonlyMap<string, Buffer>, executable: ReadonlySet<string>): SkillPackageFile[] {
  return [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, bytes]) => ({
    path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), executable: executable.has(path),
  }));
}

/** Human-facing counts derived from a complete file index. */
export function skillPackageStats(files: readonly SkillPackageFile[]) {
  return {
    fileCount: files.length,
    scriptCount: files.filter(f => f.path.startsWith('scripts/')).length,
    referenceCount: files.filter(f => /^(references|resources)\//.test(f.path)).length,
    assetCount: files.filter(f => /^(assets|templates)\//.test(f.path)).length,
    totalBytes: files.reduce((n, f) => n + f.bytes, 0),
  };
}

/** Validate the durable complete index; only an absent format denotes a legacy package. */
export function completeSkillManifest(value: unknown): { packageFormat: 2; files: SkillPackageFile[]; packageDigest: string; limits: SkillPackageLimits } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('技能包文件清单无效');
  const manifest = value as Record<string, unknown>;
  if (manifest.packageFormat === undefined) return undefined;
  if (manifest.packageFormat !== 2 || !Array.isArray(manifest.files)) invalid('技能包文件清单版本无效');
  const limits = manifest.limits as SkillPackageLimits | undefined;
  if (!limits || Object.entries(SKILL_PACKAGE_LIMITS).some(([key, ceiling]) => {
    const n = limits[key as keyof SkillPackageLimits];
    return !Number.isSafeInteger(n) || n < 1 || n > ceiling;
  })) invalid('技能包容量配置无效');
  const files: SkillPackageFile[] = [];
  if (!manifest.files.length || manifest.files.length > limits.maxFiles) invalid('技能包文件数量无效');
  for (const item of manifest.files) {
    if (!item || typeof item !== 'object' || typeof item.path !== 'string' || !Number.isSafeInteger(item.bytes) || item.bytes < 0
      || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256) || typeof item.executable !== 'boolean') invalid('技能包文件清单无效');
    files.push({ path: item.path, bytes: item.bytes, sha256: item.sha256, executable: item.executable });
  }
  assertSkillFilePaths(files.map(f => f.path));
  const instruction = files.find(f => f.path === 'SKILL.md');
  if (!instruction || instruction.bytes > limits.maxInstructionBytes || files.reduce((n, f) => n + f.bytes, 0) > limits.maxTotalBytes) invalid('技能包大小或入口无效');
  if (skillPackageDigest(files) !== manifest.packageDigest) invalid('技能包文件清单校验失败');
  return { packageFormat: 2, files, packageDigest: String(manifest.packageDigest), limits };
}
