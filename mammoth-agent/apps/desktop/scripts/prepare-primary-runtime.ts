/** Desktop resource locations and signing-aware verification for the shared runtime builder. */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import {
  preparePrimaryRuntime as preparePayload,
  smokePrimaryRuntime as smokePayload,
  primaryRuntimePayloadDigest,
} from '../../../scripts/primary-runtime/prepare.ts'
import lock from '../../../scripts/primary-runtime/lock.json' with { type: 'json' }
import { parsePrimaryRuntime, workspaceDependencyPaths } from '../../../packages/skill/tool-workspace-dependencies/src/index.ts'
import { resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { scrubWindowsSigningEnvironment } from './windows-sign.mjs'

function installedPnpmVersion(): string {
  const pnpmManifest = createRequire(import.meta.url).resolve('pnpm/package.json')
  const { version } = JSON.parse(readFileSync(pnpmManifest, 'utf8')) as { version?: string }
  if (typeof version !== 'string' || version === '') {
    throw new Error('primary runtime: installed pnpm has no version')
  }
  return version
}

/**
 * Reuse a previously prepared payload when its digest still matches the lock + installed pnpm.
 * Set MMP_DESKTOP_FORCE_PRIMARY_RUNTIME=1 to rebuild even when the payload is current.
 */
function canReusePrimaryRuntime(
  root: string,
  target: ReturnType<typeof resolveDesktopBuildTarget>,
): boolean {
  if (process.env.MMP_DESKTOP_FORCE_PRIMARY_RUNTIME === '1') return false
  const manifestPath = join(root, 'runtime.json')
  if (!existsSync(manifestPath)) return false
  try {
    const manifest = parsePrimaryRuntime(JSON.parse(readFileSync(manifestPath, 'utf8')))
    const expected = primaryRuntimePayloadDigest(target, lock, installedPnpmVersion())
    if (manifest.payloadDigest !== expected) return false
    const entries = workspaceDependencyPaths(root, manifest)
    return entries.node !== undefined && entries.pnpm !== undefined
  } catch {
    return false
  }
}

/**
 * Prepare Desktop resources for its selected packaging target.
 * @param options - Signed Windows packaging defers execution until its supervised signing stage.
 * @returns Resolves after preparation and, unless deferred, native-target execution checks.
 */
export async function preparePrimaryRuntime(options: { deferSmoke?: boolean } = {}): Promise<void> {
  const paths = resolveDesktopTargetBuildPaths()
  const target = resolveDesktopBuildTarget()
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  const root = join(paths.runtime, 'primary-runtime')
  if (canReusePrimaryRuntime(root, target)) {
    console.log(`desktop: reusing prepared primary-runtime (${root})`)
    if (!options.deferSmoke) smokePrimaryRuntime(root)
    return
  }
  await preparePayload({ target, output: paths.runtime, cache: paths.downloads, version })
  if (!options.deferSmoke) smokePrimaryRuntime(root)
}

/**
 * Verify Desktop's complete payload after preparation or platform signing.
 * @param root - Final payload directory, including any platform signatures.
 */
export function smokePrimaryRuntime(root: string): void {
  const manifest = parsePrimaryRuntime(JSON.parse(readFileSync(join(root, 'runtime.json'), 'utf8')))
  if (manifest.platform !== process.platform || manifest.arch !== process.arch) return
  if (Object.keys(manifest.pythonPackages).length === 0) throw new Error('primary runtime: missing Python distribution versions; prepare the payload before running its smoke checks.')
  const entries = workspaceDependencyPaths(root, manifest)
  if (entries.node === undefined || entries.pnpm === undefined) throw new Error('primary runtime: the Desktop payload must declare node and pnpm components.')
  smokePayload(root, scrubWindowsSigningEnvironment(process.env))
}

if (import.meta.main) await preparePrimaryRuntime()
