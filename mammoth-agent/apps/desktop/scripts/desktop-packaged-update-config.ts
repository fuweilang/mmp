/** Assert that a signed package carries the update feed it will poll after installation. */
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { load } from 'js-yaml'
import { desktopArtifactOutput, desktopTargetBuildPaths, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'
import { loadDesktopPackageEnvironment } from './desktop-package-environment.mjs'
import { resolveDesktopAutoUpdateConfig } from './desktop-auto-update-environment.mjs'
import { resolveDesktopPackageTarget, type DesktopPackageTargetName } from './package-target.ts'

const APP_ROOT = resolve(import.meta.dirname, '..')
const MACOS_PRODUCT_BUNDLE = '猛犸智能体.app'

/** Packaged target whose update configuration is being checked. */
export interface PackagedUpdateTarget {
  readonly name: DesktopPackageTargetName
  readonly platform: 'darwin' | 'win32'
  readonly arch: 'arm64' | 'x64'
}

/** Feed embedded in a packaged application, as electron-builder writes it. */
export interface PackagedUpdateConfig {
  readonly provider: 'generic'
  readonly url: string
  readonly channel: 'nightly' | 'latest' | undefined
}

/** Feed the release environment resolves for this target. */
export interface ExpectedUpdateFeed {
  readonly publicUrl: string
  readonly channel: 'nightly' | 'latest'
}

/**
 * electron-builder writes the feed into the packed application, which both installers then embed.
 * @param artifactsRoot electron-builder output directory for one target.
 * @param target Packaged platform and architecture.
 * @returns Path of the `app-update.yml` sealed into that application.
 */
export function packagedUpdateConfigPath(artifactsRoot: string, target: PackagedUpdateTarget): string {
  if (target.platform === 'win32') return join(artifactsRoot, 'win-unpacked', 'resources', 'app-update.yml')
  return join(artifactsRoot, target.arch === 'arm64' ? 'mac-arm64' : 'mac', MACOS_PRODUCT_BUNDLE,
    'Contents', 'Resources', 'app-update.yml')
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`desktop package: ${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function parsePackagedUpdateConfig(text: string, path: string): PackagedUpdateConfig {
  let parsed: unknown
  try { parsed = load(text) }
  catch (error) {
    throw new Error(`desktop package: ${path} is not YAML: ${error instanceof Error ? error.message : String(error)}`)
  }
  const config = object(parsed, path)
  if (config.provider !== 'generic') throw new Error(`desktop package: ${path} provider is ${String(config.provider)}, expected generic`)
  if (typeof config.url !== 'string' || config.url === '') throw new Error(`desktop package: ${path} url must be a non-empty string`)
  // electron-updater omits the default channel, so an absent field means latest.
  const channel = config.channel ?? 'latest'
  if (channel !== 'nightly' && channel !== 'latest') throw new Error(`desktop package: ${path} channel must be nightly or latest`)
  return { provider: 'generic', url: config.url, channel }
}

/**
 * Read the packaged feed and compare it with the feed this release environment resolves, so a signed
 * installer can never advertise automatic updates it cannot perform.
 * @param artifactsRoot electron-builder output directory for one target.
 * @param target Packaged platform and architecture.
 * @param expected Resolved feed for the selected deployment and channel.
 * @returns The packaged feed.
 * @throws When the file is absent, off-spec, or names another deployment or channel.
 */
export async function assertPackagedUpdateConfig(
  artifactsRoot: string,
  target: PackagedUpdateTarget,
  expected: ExpectedUpdateFeed,
): Promise<PackagedUpdateConfig> {
  const path = packagedUpdateConfigPath(artifactsRoot, target)
  let text: string
  try { text = await readFile(path, 'utf8') }
  catch (error) {
    const cause = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? 'app-update.yml is missing; signed builds must embed the update feed (MMP_DESKTOP_AUTO_UPDATE_ENV and MMP_DESKTOP_UPDATE_CHANNEL)'
      : error instanceof Error ? error.message : String(error)
    throw new Error(`desktop package: cannot read ${path}: ${cause}`)
  }
  const config = parsePackagedUpdateConfig(text, path)
  if (config.url !== expected.publicUrl) {
    throw new Error(`desktop package: ${path} names ${config.url}, expected ${expected.publicUrl}`)
  }
  if (config.channel !== expected.channel) {
    throw new Error(`desktop package: ${path} channel is ${config.channel}, expected ${expected.channel}`)
  }
  return config
}

/**
 * @param name Supported release target name.
 * @returns Its packaged platform and architecture.
 */
export function packagedUpdateTarget(name: string): PackagedUpdateTarget {
  const resolved = resolveDesktopPackageTarget(name)
  return { name: resolved.name, platform: resolved.platform, arch: resolved.arch }
}

function usage(): never {
  throw new Error('Usage: tsx apps/desktop/scripts/desktop-packaged-update-config.ts [--target win-x64|mac-arm64|mac-x64] [--artifacts <dir>]')
}

async function runCli(argv: readonly string[]): Promise<void> {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument !== '--target' && argument !== '--artifacts') usage()
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) usage()
    values.set(argument, value)
    index += 1
  }
  const target = packagedUpdateTarget(values.get('--target') ?? resolveDesktopBuildTarget())
  const configured = values.get('--artifacts')
  const artifactsRoot = configured === undefined
    ? desktopArtifactOutput(desktopTargetBuildPaths(target.name), { unsigned: false, skipNotarization: false }).directory
    : resolve(configured)
  const environment = loadDesktopPackageEnvironment(target.platform, process.env, APP_ROOT, { unsigned: true })
  const expected = resolveDesktopAutoUpdateConfig(environment, target.platform, target.arch)
  const config = await assertPackagedUpdateConfig(artifactsRoot, target, expected)
  console.log(`APP_UPDATE_CONFIG ${resolve(artifactsRoot)} url=${config.url} channel=${config.channel} environment=${expected.environment}`)
}

if (import.meta.main) await runCli(process.argv.slice(2))
