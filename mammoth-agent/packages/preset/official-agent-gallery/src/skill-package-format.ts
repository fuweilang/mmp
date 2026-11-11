/** Complete managed skill revision metadata and portable resource paths. */
import { createHash } from 'node:crypto'
import { z } from 'zod'

/** Supported v2 protocol ceilings; deployments may configure lower Host limits. */
export const COMPLETE_SKILL_LIMITS = Object.freeze({ maxFiles: 500, maxTotalBytes: 10485760, maxInstructionBytes: 102400 })
/** Local admission caps for complete skill preparation. */
export interface SkillPackageLimits {
  /** Maximum number of declared package files. */
  maxFiles: number
  /** Maximum sum of expanded file bytes. */
  maxTotalBytes: number
  /** Maximum original SKILL.md byte length. */
  maxInstructionBytes: number
}

/**
 * Check unchanged relative paths that remain unambiguous on supported filesystems.
 * @param path - relative package file name.
 * @returns whether the name is portable and contained.
 */
export function isSkillPackagePath(path: string): boolean {
  return path.length > 0 && path.length <= 512 && path.normalize('NFC') === path
    && !/[\\\x00-\x1f\x7f<>:"|?*]/.test(path)
    && path.split('/').every(part => part !== '' && Buffer.byteLength(part, 'utf8') <= 255 && part !== '.' && part !== '..' && !/[. ]$/.test(part)
      && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
}

const fileSchema = z.object({
  path: z.string().refine(isSkillPackagePath, 'Invalid skill package path'),
  bytes: z.number().int().nonnegative().max(COMPLETE_SKILL_LIMITS.maxTotalBytes),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  executable: z.boolean(),
}).strict()
/** Exact admitted file identity in one frozen complete revision. */
export type SkillPackageFile = z.infer<typeof fileSchema>

/**
 * Match Ground's canonical SHA-256 over sorted file identity tuples.
 * @param files - declared file identities.
 * @returns the hexadecimal package digest.
 */
export function skillPackageDigest(files: readonly SkillPackageFile[]): string {
  const sorted = [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return createHash('sha256').update(JSON.stringify(sorted.map(f => [f.path, f.bytes, f.sha256, f.executable]))).digest('hex')
}

/** Additive negotiated fields, validated before any complete package is prepared. */
export const completeSkillFields = {
  packageFormat: z.literal(2),
  files: z.array(fileSchema).min(1).max(COMPLETE_SKILL_LIMITS.maxFiles),
  packageDigest: z.string().regex(/^[a-f0-9]{64}$/),
  limits: z.object({
    maxFiles: z.number().int().positive().max(COMPLETE_SKILL_LIMITS.maxFiles),
    maxTotalBytes: z.number().int().positive().max(COMPLETE_SKILL_LIMITS.maxTotalBytes),
    maxInstructionBytes: z.number().int().positive().max(COMPLETE_SKILL_LIMITS.maxInstructionBytes),
  }).strict(),
}

/**
 * Reject ambiguous paths, inconsistent limits and file identities in a complete revision.
 * @param payload - negotiated complete revision.
 * @param local - local admission caps.
 */
export function validateCompleteSkill(
  payload: { files: readonly SkillPackageFile[]; packageDigest: string; instruction: string; limits: SkillPackageLimits },
  local: SkillPackageLimits,
): void {
  const { files, limits } = payload
  if (files.length > Math.min(limits.maxFiles, local.maxFiles)
    || files.reduce((n, f) => n + f.bytes, 0) > Math.min(limits.maxTotalBytes, local.maxTotalBytes)
    || Buffer.byteLength(payload.instruction) > Math.min(limits.maxInstructionBytes, local.maxInstructionBytes)) {
    throw new Error('Skill package byte or file limit exceeded')
  }
  const paths = new Set<string>(), directories = new Map<string, string>()
  for (const file of files) {
    const path = file.path, key = path.toLowerCase()
    if (!isSkillPackagePath(path) || paths.has(key)) throw new Error('Skill package path conflict')
    paths.add(key)
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/'), folded = dir.toLowerCase()
      if (directories.has(folded) && directories.get(folded) !== dir) throw new Error('Skill package directory path conflict')
      directories.set(folded, dir)
    }
  }
  if ([...paths].some(path => directories.has(path))) throw new Error('Skill package file/directory conflict')
  const entry = files.find(file => file.path === 'SKILL.md')
  if (!entry || entry.bytes !== Buffer.byteLength(payload.instruction)
    || entry.sha256 !== createHash('sha256').update(payload.instruction).digest('hex')) throw new Error('Skill package SKILL.md integrity mismatch')
  if (skillPackageDigest(files) !== payload.packageDigest) throw new Error('Skill package manifest digest mismatch')
}
