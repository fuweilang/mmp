/** Publish validated Desktop installers and update feeds into the Baota download directory. */
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdtemp, open, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import type { IncomingMessage } from 'node:http'
import { basename, dirname, join, resolve } from 'node:path'
import { dump, load } from 'js-yaml'
import { desktopArtifactBaseForTarget } from '../apps/desktop/scripts/desktop-artifact-name.mjs'
import { desktopUpdateMetadataFilename } from '../apps/desktop/scripts/desktop-auto-update-environment.mjs'
import type { DesktopPackageTargetName } from '../apps/desktop/scripts/package-target.ts'

const DOWNLOADS_ROOT = '/www/mmp-prod/downloads'
const PUBLIC_ORIGIN = 'https://www.mmai.vip/downloads'
const DEFAULT_SERVER = 'root@124.223.179.250'
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const SERVER_PATTERN = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/u

/** electron-updater writes one feed per channel; the deployment only offers these two. */
export type UpdateChannel = 'nightly' | 'latest'

interface DownloadPlatform {
  readonly manifestKey: string
  readonly stem: string
  readonly extension: 'exe' | 'dmg'
  /** Installer kind published beside the dmg/exe; macOS updates ship the zip, Windows reuses the exe. */
  readonly updaterExtension: 'exe' | 'zip'
  readonly alias: string
  /** Node platform naming used by electron-updater's channel metadata. */
  readonly nodePlatform: 'win32' | 'darwin'
}

const DOWNLOAD_PLATFORMS: Record<DesktopPackageTargetName, DownloadPlatform> = {
  'win-x64': { manifestKey: 'windows-amd64', stem: 'mammoth-agent-win-x64', extension: 'exe', updaterExtension: 'exe', alias: 'mammoth-agent-win.exe', nodePlatform: 'win32' },
  'mac-arm64': { manifestKey: 'darwin-arm64', stem: 'mammoth-agent-mac-arm64', extension: 'dmg', updaterExtension: 'zip', alias: 'mammoth-agent-mac-arm64.dmg', nodePlatform: 'darwin' },
  'mac-x64': { manifestKey: 'darwin-amd64', stem: 'mammoth-agent-mac-x64', extension: 'dmg', updaterExtension: 'zip', alias: 'mammoth-agent-mac-x64.dmg', nodePlatform: 'darwin' },
}

/** One download platform entry in the user-facing manifest. */
export interface DesktopManifestEntry {
  readonly shell: { readonly version: string }
  readonly file: string
  readonly sha256: string
  readonly bytes: number
  readonly signed: boolean
  readonly automatic_updates: boolean
}

/** Merged user-facing manifest; platform entries other than the selected one are preserved verbatim. */
export interface DesktopManifest {
  readonly product: string
  readonly schema_version: number
  readonly updated_at: string
  readonly platforms: Record<string, unknown>
}

/** Immutable versioned filename plus the mutable fixed-name alias for one release target. */
export interface DownloadNames {
  readonly platformKey: string
  readonly versioned: string
  readonly alias: string
}

/** Command-line request for one publication attempt; `execute` stays false unless `--yes` is passed. */
export interface PublishCliOptions {
  readonly platform: DesktopPackageTargetName
  readonly input: string
  readonly version: string
  readonly server: string
  readonly feed: boolean
  readonly signed: boolean
  /** Explicit channel; absent derives it from the version and any package record. */
  readonly channel: UpdateChannel | undefined
  readonly execute: boolean
}

/** One file published into a channel feed directory beside its metadata. */
export interface FeedUpload {
  readonly localPath: string
  readonly name: string
  readonly sha256: string
  readonly bytes: number
}

/** Update feed published beside the manifest when `--feed` is selected. */
export interface FeedPublication {
  readonly ymlName: string
  readonly yml: string
  readonly publicUrl: string
  readonly version: string
  readonly channel: UpdateChannel
  /** Update file the feed references: the Windows installer or the macOS zip. */
  readonly updaterName: string
  readonly updaterUrl: string
  readonly updaterSha512: string
  readonly updaterSize: number
  /** Files placed in the feed directory before its metadata. */
  readonly uploads: readonly FeedUpload[]
}

/** Local artifact set validated before any remote write. */
export interface PublishPlan {
  readonly platform: DesktopPackageTargetName
  readonly version: string
  readonly channel: UpdateChannel
  readonly server: string
  readonly publicOrigin: string
  readonly sourcePath: string
  readonly versionedName: string
  readonly aliasName: string
  readonly platformKey: string
  readonly sha256: string
  readonly bytes: number
  readonly signed: boolean
  readonly feed: boolean
  readonly manifestEntry: DesktopManifestEntry
  readonly feedFiles: FeedPublication | null
  readonly warnings: readonly string[]
}

/** Filesystem operations against the Baota download directory. */
export interface PublishRemote {
  /** @param path Absolute remote path. @returns File text, or null when the file is absent. */
  read(path: string): Promise<string | null>
  /** @param path Absolute remote path. @returns Lowercase SHA-256, or null when the file is absent. */
  hash(path: string): Promise<string | null>
  /** @param source Absolute remote source. @param destination Absolute remote destination. */
  copy(source: string, destination: string): Promise<void>
  /** @param source Absolute remote source. @param destination Absolute remote destination replaced by one rename. */
  replaceFrom(source: string, destination: string): Promise<void>
  /** @param path Absolute remote destination. @param contents Complete file text. */
  writeAtomic(path: string, contents: string): Promise<void>
  /** @param localPath Local file. @param destination Absolute remote destination. */
  upload(localPath: string, destination: string): Promise<void>
  /** @param path Absolute remote path; absent files are ignored. */
  remove(path: string): Promise<void>
}

/** HTTP observation of a public download URL. */
export interface PublicProbe {
  readonly status: number
  readonly bytes: number | null
}

/** HTTP observation of public bytes with their SHA-256. */
export interface PublicDigest extends PublicProbe {
  readonly bytes: number
  readonly sha256: string
}

/** HTTP observation of a small public text document, such as one update feed. */
export interface PublicText {
  readonly status: number
  readonly text: string
}

/** Injected remote, clock, HTTP, and logging dependencies used by one publication. */
export interface PublishEnvironment {
  /** Absent for dry runs, which never write. */
  readonly remote: PublishRemote | undefined
  readonly dryRun: boolean
  readonly now: Date
  readonly head: (url: string) => Promise<PublicProbe>
  readonly fetchHash: (url: string) => Promise<PublicDigest>
  readonly fetchText: (url: string) => Promise<PublicText>
  readonly fetchManifest: () => Promise<DesktopManifest | null>
  readonly log: (line: string) => void
}

/** Applied or planned publication, including the manifest change and public verification evidence. */
export interface PublishOutcome {
  readonly dryRun: boolean
  readonly platformKey: string
  readonly versionedName: string
  readonly aliasName: string
  readonly sha256: string
  readonly bytes: number
  readonly signed: boolean
  readonly automaticUpdates: boolean
  readonly changed: readonly string[]
  readonly manifest: DesktopManifest
  readonly previousManifest: DesktopManifest | null
  readonly publicVerification: PublicDigest | null
}

/** Local inputs used to build one publication plan. */
export interface PublishPlanOptions {
  readonly platform: DesktopPackageTargetName
  readonly input: string
  readonly version: string
  readonly server: string
  readonly feed: boolean
  /** Operator's signing claim for targets whose packaging records none. */
  readonly signed: boolean
  /** Explicit channel; absent reads the package record, then derives it from the version. */
  readonly channel: UpdateChannel | undefined
  readonly publicOrigin: string
}

/** @param value A workflow target name. @returns The same name narrowed to a supported download platform. */
export function resolveDownloadPlatform(value: string): DesktopPackageTargetName {
  if (value === 'win-x64' || value === 'mac-arm64' || value === 'mac-x64') return value
  throw new Error(`desktop downloads: unsupported platform ${JSON.stringify(value)} (expected win-x64, mac-arm64, or mac-x64)`)
}

/**
 * Validate a release version before it reaches a file or URL name.
 * @param version Candidate stable or prerelease version.
 * @returns The validated version.
 */
export function validatePublishVersion(version: string): string {
  if (!VERSION_PATTERN.test(version)) throw new Error(`desktop downloads: invalid version ${JSON.stringify(version)}`)
  return version
}

/**
 * @param platform Supported release target.
 * @param version Published version.
 * @param sha256 Installer SHA-256 in lowercase hex.
 * @returns Manifest key, immutable filename, and fixed alias for that target.
 */
export function resolveDownloadNames(platform: DesktopPackageTargetName, version: string, sha256: string): DownloadNames {
  validatePublishVersion(version)
  if (!/^[0-9a-f]{64}$/u.test(sha256)) throw new Error('desktop downloads: installer SHA-256 must be 64 lowercase hexadecimal characters')
  const target = DOWNLOAD_PLATFORMS[platform]
  return {
    platformKey: target.manifestKey,
    versioned: `${target.stem}-${version}-${sha256.slice(0, 8)}.${target.extension}`,
    alias: target.alias,
  }
}

function acceptedArtifactNames(platform: DesktopPackageTargetName, version: string): readonly string[] {
  const target = DOWNLOAD_PLATFORMS[platform]
  const base = desktopArtifactBaseForTarget(version, platform)
  const release = `${base}.${target.extension}`
  const unsigned = `${base}-unsigned.${target.extension}`
  return [release, unsigned]
}

/**
 * @param platform Supported release target.
 * @param version Published version.
 * @returns Update file names an electron-builder feed may reference for this target.
 */
export function acceptedUpdateFileNames(platform: DesktopPackageTargetName, version: string): readonly string[] {
  const extension = DOWNLOAD_PLATFORMS[platform].updaterExtension
  const base = desktopArtifactBaseForTarget(version, platform)
  return [`${base}.${extension}`, `${base}-unsigned.${extension}`]
}

/**
 * @param platform Supported release target.
 * @param version Published version.
 * @param channel Selected update channel.
 * @returns electron-updater channel metadata filename, such as `latest-mac.yml`.
 */
export function resolveFeedMetadataName(
  platform: DesktopPackageTargetName,
  version: string,
  channel: UpdateChannel,
): string {
  return desktopUpdateMetadataFilename(version, DOWNLOAD_PLATFORMS[platform].nodePlatform, channel)
}

/**
 * @param version Published version.
 * @param requested Channel selected on the command line or recorded by packaging.
 * @returns The requested channel, or nightly for a prerelease and latest for a stable version.
 */
export function resolvePublishChannel(version: string, requested: UpdateChannel | undefined): UpdateChannel {
  validatePublishVersion(version)
  if (requested === undefined) return version.includes('-') ? 'nightly' : 'latest'
  if (requested === 'latest' && version.includes('-')) {
    throw new Error(`desktop downloads: latest requires a stable version, received ${version}`)
  }
  return requested
}

/**
 * Reject artifacts whose name does not identify this exact version, target, and artifact kind.
 * @param name Installer basename.
 * @param platform Supported release target.
 * @param version Published version.
 */
export function validateDesktopArtifactName(name: string, platform: DesktopPackageTargetName, version: string): void {
  if (!acceptedArtifactNames(platform, version).includes(name)) {
    throw new Error(`desktop downloads: ${name} is not ${platform} ${version}; expected ${acceptedArtifactNames(platform, version).join(' or ')}`)
  }
}

/**
 * Parse the PE machine field from a Windows executable header.
 * @param header At least the DOS and PE-COFF headers.
 * @returns The PE machine value, such as 0x8664 for x64.
 */
export function parsePeMachine(header: Buffer): number {
  if (header.length < 0x40) throw new Error('desktop downloads: truncated DOS header')
  if (header.readUInt16LE(0) !== 0x5a4d) throw new Error('desktop downloads: missing MZ signature')
  const peOffset = header.readUInt32LE(0x3c)
  if (peOffset + 6 > header.length) throw new Error('desktop downloads: truncated PE header')
  if (header.readUInt32LE(peOffset) !== 0x00004550) throw new Error('desktop downloads: missing PE signature')
  return header.readUInt16LE(peOffset + 4)
}

/** @param header Windows executable header. @returns Nothing; throws unless the PE machine is x64. */
export function assertWindowsX64(header: Buffer): void {
  const machine = parsePeMachine(header)
  if (machine !== 0x8664) {
    throw new Error(`desktop downloads: Windows installer machine is 0x${machine.toString(16)}, expected x64 (0x8664)`)
  }
}

/**
 * NSIS installers are 32-bit stubs even when they install an x64 application, so their PE machine
 * cannot carry the target architecture.
 * @param header Installer header bytes.
 * @returns Whether the Nullsoft installer signature is present.
 */
export function isNsisInstaller(header: Buffer): boolean {
  return header.includes(Buffer.from('NullsoftInst', 'latin1'))
}

/**
 * @param before Existing manifest, or null when none is published.
 * @param platformKey Entry replaced in place.
 * @param entry New entry for that platform.
 * @param updatedAt Publication timestamp.
 * @returns A merged manifest; every other platform entry is retained.
 */
export function mergeDesktopManifest(
  before: DesktopManifest | null,
  platformKey: string,
  entry: DesktopManifestEntry,
  updatedAt: string,
): DesktopManifest {
  const base: DesktopManifest = before ?? { product: 'mammoth-agent', schema_version: 2, updated_at: updatedAt, platforms: {} }
  return {
    product: 'mammoth-agent',
    schema_version: 2,
    updated_at: updatedAt,
    platforms: { ...base.platforms, [platformKey]: entry },
  }
}

/**
 * @param text Manifest JSON.
 * @returns The parsed manifest.
 */
export function parseDesktopManifest(text: string): DesktopManifest {
  let parsed: unknown
  try { parsed = JSON.parse(text) }
  catch (error) { throw new Error(`desktop downloads: manifest is not JSON: ${error instanceof Error ? error.message : String(error)}`) }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('desktop downloads: manifest must be an object')
  }
  const value = parsed as Record<string, unknown>
  if (value.product !== 'mammoth-agent') throw new Error('desktop downloads: manifest product must be mammoth-agent')
  if (value.schema_version !== 2) throw new Error('desktop downloads: manifest schema_version must be 2')
  if (typeof value.updated_at !== 'string') throw new Error('desktop downloads: manifest updated_at must be a string')
  if (typeof value.platforms !== 'object' || value.platforms === null || Array.isArray(value.platforms)) {
    throw new Error('desktop downloads: manifest platforms must be an object')
  }
  return {
    product: 'mammoth-agent',
    schema_version: 2,
    updated_at: value.updated_at,
    platforms: value.platforms as Record<string, unknown>,
  }
}

/**
 * @param options Signed flag for the artifact and whether an update feed is published.
 * @returns The manifest entry and any forced-false warning.
 */
export function resolveManifestEntry(options: {
  readonly version: string
  readonly file: string
  readonly sha256: string
  readonly bytes: number
  readonly signed: boolean
  readonly feed: boolean
}): { readonly entry: DesktopManifestEntry; readonly warnings: readonly string[] } {
  if (!Number.isSafeInteger(options.bytes) || options.bytes <= 0) {
    throw new Error('desktop downloads: installer bytes must be a positive integer')
  }
  const warnings: string[] = []
  // electron-updater installs unverified bytes without signature/publisher matching; unsigned builds
  // must stay manual downloads. A signed build without a published feed also has nowhere to update from.
  const automaticUpdates = options.signed && options.feed
  if (!options.signed) {
    warnings.push('SIGNED=false: automatic_updates 强制为 false；签名前不得开启自动更新')
  } else if (!options.feed) {
    warnings.push('SIGNED=true 但未选择 --feed：没有更新源，automatic_updates 保持 false')
  }
  return {
    entry: {
      shell: { version: options.version },
      file: options.file,
      sha256: options.sha256,
      bytes: options.bytes,
      signed: options.signed,
      automatic_updates: automaticUpdates,
    },
    warnings,
  }
}

function fieldValue(source: unknown, path: readonly string[]): unknown {
  let current: unknown = source
  for (const key of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/**
 * @param before Existing entry for the platform, if any.
 * @param after Entry about to be published.
 * @returns One `field: before -> after` line per changed manifest field, or `unchanged`.
 */
export function describeManifestChange(before: unknown, after: DesktopManifestEntry): readonly string[] {
  const fields = ['shell.version', 'file', 'sha256', 'bytes', 'signed', 'automatic_updates'] as const
  const changed: string[] = []
  for (const field of fields) {
    const previous = fieldValue(before, field.split('.'))
    const next = fieldValue(after, field.split('.'))
    if (previous !== next) changed.push(`${field}: ${previous === undefined ? '<absent>' : JSON.stringify(previous)} -> ${JSON.stringify(next)}`)
  }
  return changed.length === 0 ? ['unchanged'] : changed
}

/**
 * @param conflict Existing manifest bytes for the same versioned name but different content.
 * @returns Nothing; throws when immutable publication would be violated.
 */
export function assertNoImmutableConflict(conflict: string | null): void {
  if (conflict !== null) {
    throw new Error(`desktop downloads: ${conflict} already exists with different bytes; refusing to replace a published version`)
  }
}

async function readHead(path: string, length: number): Promise<Buffer> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, 0)
    return buffer.subarray(0, bytesRead)
  }
  finally { await handle.close() }
}

async function hashFile(path: string, algorithm: 'sha256' | 'sha512', encoding: 'hex' | 'base64'): Promise<{ digest: string; bytes: number }> {
  const hash = createHash(algorithm)
  let bytes = 0
  for await (const chunk of createReadStream(path) as AsyncIterable<Buffer>) { hash.update(chunk); bytes += chunk.length }
  return { digest: hash.digest(encoding), bytes }
}

/**
 * @param input Directory holding packaged artifacts.
 * @param platform Target.
 * @param version Expected version.
 * @returns Absolute installer path.
 */
export async function findDesktopInstaller(input: string, platform: DesktopPackageTargetName, version: string): Promise<string> {
  const directory = resolve(input)
  let names: string[]
  try { names = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => entry.name) }
  catch (error) {
    throw new Error(`desktop downloads: cannot read ${directory}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const accepted = acceptedArtifactNames(platform, version)
  const matches = names.filter(name => accepted.includes(name)).sort()
  if (matches.length !== 1) {
    throw new Error(`desktop downloads: expected exactly one ${platform} ${version} installer in ${directory}, found ${matches.length === 0 ? 'none' : matches.join(', ')}`)
  }
  const only = matches[0]
  if (only === undefined) throw new Error(`desktop downloads: no ${platform} ${version} installer in ${directory}`)
  return join(directory, only)
}

async function findAppBundle(directory: string, depth = 0): Promise<string | undefined> {
  if (depth > 2) return undefined
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const full = join(directory, entry.name)
    if (entry.name.endsWith('.app')) return full
    const nested = await findAppBundle(full, depth + 1)
    if (nested !== undefined) return nested
  }
  return undefined
}

async function checkAppBundleArchitecture(bundle: string, platform: 'mac-arm64' | 'mac-x64'): Promise<void> {
  const binaries = (await readdir(join(bundle, 'Contents', 'MacOS'), { withFileTypes: true })).filter(entry => entry.isFile())
  if (binaries.length !== 1 || binaries[0] === undefined) throw new Error(`desktop downloads: expected one main binary in ${bundle}`)
  let archs: string
  try { archs = execFileSync('lipo', ['-archs', join(bundle, 'Contents', 'MacOS', binaries[0].name)], { encoding: 'utf8' }).trim() }
  catch (error) { throw new Error(`desktop downloads: lipo failed for ${bundle}: ${error instanceof Error ? error.message : String(error)}`) }
  const expected = platform === 'mac-arm64' ? 'arm64' : 'x86_64'
  if (!archs.split(/\s+/u).includes(expected)) {
    throw new Error(`desktop downloads: ${platform} main binary is ${archs}, expected ${expected}`)
  }
}

async function assertMacBundleArchitecture(input: string, platform: 'mac-arm64' | 'mac-x64', installer: string): Promise<void> {
  const bundle = await findAppBundle(resolve(input))
  if (bundle !== undefined) { await checkAppBundleArchitecture(bundle, platform); return }
  // Packaged artifacts hold only the dmg; mount it read-only so lipo still reads the real app binary.
  const mount = await mkdtemp(join(tmpdir(), 'mmp-downloads-dmg-'))
  try {
    execFileSync('hdiutil', ['attach', installer, '-nobrowse', '-readonly', '-mountpoint', mount], { stdio: 'ignore' })
    const mounted = await findAppBundle(mount)
    if (mounted === undefined) throw new Error(`desktop downloads: ${installer} contains no .app bundle`)
    await checkAppBundleArchitecture(mounted, platform)
  }
  catch (error) {
    throw new Error(`desktop downloads: cannot verify ${platform} architecture with lipo: ${error instanceof Error ? error.message : String(error)}`)
  }
  finally {
    try { execFileSync('hdiutil', ['detach', mount, '-force'], { stdio: 'ignore' }) }
    catch { /* The image may not have mounted; the temporary directory is removed either way. */ }
    await rm(mount, { recursive: true, force: true })
  }
}

async function inspectInstallerArchitecture(path: string, platform: DesktopPackageTargetName, input: string): Promise<string | null> {
  if (platform === 'win-x64') {
    const header = await readHead(path, 1024 * 1024)
    const machine = parsePeMachine(header)
    if (machine === 0x8664) return null
    if (machine === 0x014c && isNsisInstaller(header)) {
      return 'NSIS 安装器为 i386 stub：x64 架构取自 electron-builder 目标名 win-x64，安装器 PE 机器字段不代表应用架构'
    }
    throw new Error(`desktop downloads: Windows installer machine is 0x${machine.toString(16)}, expected x64 (0x8664)`)
  }
  await assertMacBundleArchitecture(input, platform, path)
  return null
}

/**
 * @param input Directory holding packaged artifacts.
 * @returns `installer.json`'s signing claim, or undefined when packaging did not write that file.
 */
export async function readInstallerJsonSignature(input: string): Promise<boolean | undefined> {
  let text: string
  try { text = await readFile(join(resolve(input), 'installer.json'), 'utf8') }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw new Error(`desktop downloads: cannot read installer.json: ${error instanceof Error ? error.message : String(error)}`)
  }
  let parsed: unknown
  try { parsed = JSON.parse(text) }
  catch (error) { throw new Error(`desktop downloads: installer.json is not JSON: ${error instanceof Error ? error.message : String(error)}`) }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('desktop downloads: installer.json must be an object')
  const signed = (parsed as Record<string, unknown>).signed
  if (signed !== undefined && typeof signed !== 'boolean') throw new Error('desktop downloads: installer.json signed must be a boolean')
  return signed === true
}

/**
 * Windows packaging records its signing result in `installer.json`. macOS packaging records none, so a
 * macOS artifact counts as signed only when the operator says so and the update zip it seals exists.
 * @param options Packaging evidence, selected target, `--signed`, and whether the update zip is present.
 * @returns Whether the artifact may advertise automatic updates.
 */
export function resolveArtifactSigned(options: {
  readonly recorded: boolean | undefined
  readonly platform: DesktopPackageTargetName
  readonly signedFlag: boolean
  readonly updateFilePresent: boolean
}): boolean {
  if (options.recorded !== undefined) return options.recorded
  if (options.platform === 'win-x64') {
    if (options.signedFlag) throw new Error('desktop downloads: --signed applies to macOS targets; Windows signing is read from installer.json')
    return false
  }
  if (!options.signedFlag) return false
  if (!options.updateFilePresent) {
    throw new Error(`desktop downloads: --signed requires the update zip beside the ${options.platform} artifacts`)
  }
  return true
}

function objectField(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`desktop downloads: ${label} must be an object`)
  return value as Record<string, unknown>
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`desktop downloads: ${label} must be a non-empty string`)
  return value
}

function numberField(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error(`desktop downloads: ${label} must be a positive integer`)
  return value
}

/**
 * @param input Artifacts directory.
 * @param platform Supported release target.
 * @param version Expected version.
 * @returns The macOS update zip published in the feed directory, or undefined when packaging wrote none.
 */
export async function findUpdateArchive(input: string, platform: DesktopPackageTargetName, version: string): Promise<string | undefined> {
  for (const name of acceptedUpdateFileNames(platform, version)) {
    const path = join(resolve(input), name)
    const details = await stat(path).catch(() => undefined)
    if (details !== undefined && details.isFile() && details.size > 0) return path
  }
  return undefined
}

async function feedUpload(localPath: string): Promise<FeedUpload> {
  const digest = await hashFile(localPath, 'sha256', 'hex')
  return { localPath, name: basename(localPath), sha256: digest.digest, bytes: digest.bytes }
}

/**
 * Validate electron-builder update metadata against the packaged artifacts and normalize its URL.
 * @param options Input directory, target, version, channel, installer, and the URLs the feed may reference.
 * @returns The feed metadata, its uploads, and the exact update-file digest it must advertise.
 */
export async function createFeedPublication(options: {
  readonly input: string
  readonly platform: DesktopPackageTargetName
  readonly version: string
  readonly channel: UpdateChannel
  readonly installer: string
  readonly publishedUrl: string
  readonly publicOrigin: string
}): Promise<FeedPublication> {
  const ymlName = resolveFeedMetadataName(options.platform, options.version, options.channel)
  const ymlPath = join(resolve(options.input), ymlName)
  let text: string
  try { text = await readFile(ymlPath, 'utf8') }
  catch (error) {
    const cause = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? 'file is absent (electron-builder writes it only for release builds with an update provider)'
      : error instanceof Error ? error.message : String(error)
    throw new Error(`desktop downloads: --feed requires ${ymlPath}: ${cause}`)
  }
  let parsed: unknown
  try { parsed = load(text) }
  catch (error) { throw new Error(`desktop downloads: ${ymlName} is not YAML: ${error instanceof Error ? error.message : String(error)}`) }
  const metadata = objectField(parsed, ymlName)
  const metadataVersion = stringField(metadata.version, `${ymlName}.version`)
  if (metadataVersion !== options.version) {
    throw new Error(`desktop downloads: ${ymlName} version ${metadataVersion} does not match ${options.version}`)
  }
  if (!Array.isArray(metadata.files) || metadata.files.length !== 1) {
    throw new Error(`desktop downloads: ${ymlName}.files must contain exactly one update file`)
  }
  const updater = objectField(metadata.files[0], `${ymlName}.files[0]`)
  const updaterName = basename(stringField(updater.url ?? updater.path, `${ymlName}.files[0].url`))
  // A macOS feed ships the zip updater, while the download alias is the dmg; only Windows reuses the installer.
  const accepted = acceptedUpdateFileNames(options.platform, options.version)
  if (!accepted.includes(updaterName)) {
    throw new Error(`desktop downloads: ${ymlName} references ${updaterName}, expected ${accepted.join(' or ')}`)
  }
  if (options.platform === 'win-x64' && basename(options.installer) !== updaterName) {
    throw new Error(`desktop downloads: ${ymlName} references ${updaterName}, expected installer ${basename(options.installer)}`)
  }
  const updaterPath = join(resolve(options.input), updaterName)
  const details = await stat(updaterPath).catch(() => undefined)
  if (details === undefined || !details.isFile() || details.size === 0) {
    throw new Error(`desktop downloads: ${ymlName} references missing update file ${updaterPath}`)
  }
  const digest = await hashFile(updaterPath, 'sha512', 'base64')
  if (numberField(updater.size, `${ymlName}.files[0].size`) !== digest.bytes
    || stringField(updater.sha512, `${ymlName}.files[0].sha512`) !== digest.digest) {
    throw new Error(`desktop downloads: ${updaterName} bytes do not match ${ymlName}`)
  }
  const blockmapPath = `${updaterPath}.blockmap`
  const blockmap = await stat(blockmapPath).catch(() => undefined)
  if (blockmap === undefined || !blockmap.isFile() || blockmap.size === 0) {
    throw new Error(`desktop downloads: missing blockmap ${blockmapPath}`)
  }
  // Windows reuses the versioned installer already published at the download root; macOS has no such
  // copy of the zip, so the feed directory holds the updater the metadata points at.
  const updaterUrl = options.platform === 'win-x64'
    ? options.publishedUrl
    : `${options.publicOrigin}/mmp-desk/feeds/${options.platform}/${updaterName}`
  const published = {
    ...metadata,
    files: [{ ...updater, url: updaterUrl }],
    ...(metadata.path === undefined ? {} : { path: updaterUrl }),
  }
  const uploads: FeedUpload[] = []
  if (options.platform !== 'win-x64') uploads.push(await feedUpload(updaterPath))
  uploads.push(await feedUpload(blockmapPath))
  return {
    ymlName,
    yml: dump(published),
    publicUrl: `${options.publicOrigin}/mmp-desk/feeds/${options.platform}/${ymlName}`,
    version: options.version,
    channel: options.channel,
    updaterName,
    updaterUrl,
    updaterSha512: digest.digest,
    updaterSize: digest.bytes,
    uploads,
  }
}

/**
 * Compare a fetched feed with the publication it must describe.
 * @param feed Feed written by this publication.
 * @param publicYml Public observation of that feed.
 * @returns Nothing; throws unless the public bytes still name this update file and its digest.
 */
export function verifyPublishedFeed(feed: FeedPublication, publicYml: PublicText): void {
  if (publicYml.status !== 200) {
    throw new Error(`public feed verification failed for ${feed.publicUrl}: status=${publicYml.status}`)
  }
  let parsed: unknown
  try { parsed = load(publicYml.text) }
  catch (error) { throw new Error(`public feed ${feed.publicUrl} is not YAML: ${error instanceof Error ? error.message : String(error)}`) }
  const metadata = objectField(parsed, feed.publicUrl)
  if (metadata.version !== feed.version) {
    throw new Error(`public feed ${feed.publicUrl} serves version ${String(metadata.version)}, expected ${feed.version}`)
  }
  if (!Array.isArray(metadata.files) || metadata.files.length !== 1) {
    throw new Error(`public feed ${feed.publicUrl}.files must contain exactly one update file`)
  }
  const updater = objectField(metadata.files[0], `${feed.publicUrl}.files[0]`)
  if (updater.url !== feed.updaterUrl || updater.size !== feed.updaterSize || updater.sha512 !== feed.updaterSha512) {
    throw new Error(`public feed ${feed.publicUrl} does not describe ${feed.updaterUrl} with its published sha512 and size`)
  }
}

function assertPublicOrigin(origin: string): string {
  let parsed: URL
  try { parsed = new URL(origin) }
  catch { throw new Error(`desktop downloads: invalid public origin ${JSON.stringify(origin)}`) }
  if (parsed.protocol !== 'https:' || parsed.search !== '' || parsed.hash !== '') {
    throw new Error('desktop downloads: public origin must be an HTTPS URL without a query or fragment')
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/$/u, '')}`
}

/**
 * Read the channel packaging recorded for this target, so publishing writes the feed the installer
 * actually polls. A record of another version only warns: the artifact names still carry the version.
 * @param input Artifacts directory.
 * @param platform Selected release target.
 * @param version Version being published.
 * @param requested Channel selected on the command line, if any.
 * @returns The channel whose metadata filename this publication writes.
 */
export async function resolveRecordedChannel(
  input: string,
  platform: DesktopPackageTargetName,
  version: string,
  requested: UpdateChannel | undefined,
): Promise<UpdateChannel> {
  const derived = resolvePublishChannel(version, requested)
  const recordPath = join(resolve(input), `${platform}-release.json`)
  let text: string
  try { text = await readFile(recordPath, 'utf8') }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return derived
    throw new Error(`desktop downloads: cannot read ${recordPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
  let parsed: unknown
  try { parsed = JSON.parse(text) }
  catch (error) { throw new Error(`desktop downloads: ${recordPath} is not JSON: ${error instanceof Error ? error.message : String(error)}`) }
  const record = objectField(parsed, recordPath)
  const channel = record.channel
  if (channel !== 'nightly' && channel !== 'latest') {
    throw new Error(`desktop downloads: ${recordPath}.channel must be nightly or latest`)
  }
  if (requested !== undefined && requested !== channel) {
    throw new Error(`desktop downloads: --channel ${requested} does not match the packaged ${channel} channel in ${recordPath}`)
  }
  if (record.version !== version) {
    throw new Error(`desktop downloads: ${recordPath} records version ${String(record.version)}, publishing ${version}`)
  }
  return channel
}

/**
 * Validate the local artifact set and compute every name, hash, manifest entry, and feed file.
 * @param options Target, input directory, version, server, feed selection, and public origin.
 * @returns A publication plan that has not touched the network or remote filesystem.
 */
export async function createPublishPlan(options: PublishPlanOptions): Promise<PublishPlan> {
  validatePublishVersion(options.version)
  if (!SERVER_PATTERN.test(options.server)) throw new Error(`desktop downloads: invalid --server ${JSON.stringify(options.server)}`)
  const publicOrigin = assertPublicOrigin(options.publicOrigin)
  const installer = await findDesktopInstaller(options.input, options.platform, options.version)
  const architectureWarning = await inspectInstallerArchitecture(installer, options.platform, options.input)
  const installerDigest = await hashFile(installer, 'sha256', 'hex')
  const names = resolveDownloadNames(options.platform, options.version, installerDigest.digest)
  const channel = await resolveRecordedChannel(options.input, options.platform, options.version, options.channel)
  const updateArchive = options.platform === 'win-x64'
    ? installer
    : await findUpdateArchive(options.input, options.platform, options.version)
  const signed = resolveArtifactSigned({
    recorded: await readInstallerJsonSignature(options.input),
    platform: options.platform,
    signedFlag: options.signed,
    updateFilePresent: updateArchive !== undefined,
  })
  const resolved = resolveManifestEntry({
    version: options.version,
    file: names.versioned,
    sha256: installerDigest.digest,
    bytes: installerDigest.bytes,
    signed,
    feed: options.feed,
  })
  const warnings = architectureWarning === null ? resolved.warnings : [architectureWarning, ...resolved.warnings]
  const feedFiles = options.feed
    ? await createFeedPublication({
      input: options.input,
      platform: options.platform,
      version: options.version,
      channel,
      installer,
      publishedUrl: `${publicOrigin}/${names.versioned}`,
      publicOrigin,
    })
    : null
  return {
    platform: options.platform,
    version: options.version,
    channel,
    server: options.server,
    publicOrigin,
    sourcePath: installer,
    versionedName: names.versioned,
    aliasName: names.alias,
    platformKey: names.platformKey,
    sha256: installerDigest.digest,
    bytes: installerDigest.bytes,
    signed,
    feed: options.feed,
    manifestEntry: resolved.entry,
    feedFiles,
    warnings,
  }
}

/** @param date Publication instant. @returns UTC backup suffix, `YYYYMMDD-HHMMSS`. */
export function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, 15)
}

function remotePath(name: string): string {
  return `${DOWNLOADS_ROOT}/${name}`
}

function feedDirectory(platform: DesktopPackageTargetName): string {
  return `${DOWNLOADS_ROOT}/mmp-desk/feeds/${platform}`
}

/**
 * Apply or simulate one publication. Remote writes happen only after every local and naming check;
 * the manifest is written last and restored from its `.prev-<stamp>` backup when any later step fails.
 * @param plan Validated local publication plan.
 * @param environment Injected remote, clock, HTTP probes, and log sink.
 * @returns The plan outcome, including the merged manifest and public verification result.
 */
export async function applyPublishPlan(plan: PublishPlan, environment: PublishEnvironment): Promise<PublishOutcome> {
  const { log } = environment
  const manifestPath = remotePath('mammoth-latest.json')
  const versionedPath = remotePath(plan.versionedName)
  const aliasPath = remotePath(plan.aliasName)
  const stamp = formatTimestamp(environment.now)
  const updatedAt = environment.now.toISOString()
  const manifestBackup = `${manifestPath}.prev-${stamp}`
  const aliasBackup = `${aliasPath}.prev-${stamp}`
  const versionedUrl = `${plan.publicOrigin}/${plan.versionedName}`
  const aliasUrl = `${plan.publicOrigin}/${plan.aliasName}`

  const previous = environment.dryRun
    ? await environment.fetchManifest().catch((error: unknown) => {
      log(`WARN 线上 manifest 读取失败，按空清单继续：${error instanceof Error ? error.message : String(error)}`)
      return null
    })
    : await (async () => {
      const remote = environment.remote
      if (remote === undefined) throw new Error('desktop downloads: publish mode requires a remote')
      const text = await remote.read(manifestPath)
      return text === null ? null : parseDesktopManifest(text)
    })()
  const manifest = mergeDesktopManifest(previous, plan.platformKey, plan.manifestEntry, updatedAt)
  const changed = describeManifestChange(fieldValue(previous?.platforms, [plan.platformKey]), plan.manifestEntry)

  log(`MODE ${environment.dryRun ? 'dry-run（不写入远端；--yes 才发布）' : 'publish'}`)
  log(`PLATFORM ${plan.platform}`)
  log(`SOURCE ${plan.sourcePath}`)
  log(`TARGETFILE ${plan.versionedName}`)
  log(`ALIAS ${plan.aliasName}`)
  log(`SHA256 ${plan.sha256}`)
  log(`BYTES ${plan.bytes}`)
  log(`SIGNED ${plan.signed}`)
  log(`CHANNEL ${plan.channel}`)
  log(`FEED ${plan.feedFiles === null
    ? 'none'
    : `${plan.feedFiles.ymlName} + ${plan.feedFiles.uploads.map(upload => upload.name).join(' + ')} -> ${feedDirectory(plan.platform)}`}`)
  log(`AUTOMATIC_UPDATES ${plan.manifestEntry.automatic_updates}`)
  for (const warning of plan.warnings) log(`WARN ${warning}`)
  log(`MANIFEST ${manifestPath} (backup ${manifestBackup})`)
  for (const line of changed) log(`DIFF platforms.${plan.platformKey} ${line}`)

  if (environment.dryRun) {
    let probe: PublicProbe | null = null
    try { probe = await environment.head(versionedUrl) }
    catch (error) { log(`WARN 公网 HEAD 失败：${error instanceof Error ? error.message : String(error)}`) }
    log(probe === null ? `PUBLIC ${versionedUrl} <unreachable>` : `PUBLIC ${versionedUrl} status=${probe.status} bytes=${probe.bytes ?? '?'}`)
    return {
      dryRun: true,
      platformKey: plan.platformKey,
      versionedName: plan.versionedName,
      aliasName: plan.aliasName,
      sha256: plan.sha256,
      bytes: plan.bytes,
      signed: plan.signed,
      automaticUpdates: plan.manifestEntry.automatic_updates,
      changed,
      manifest,
      previousManifest: previous,
      publicVerification: null,
    }
  }

  const remote = environment.remote
  if (remote === undefined) throw new Error('desktop downloads: publish mode requires a remote')
  const existing = await remote.hash(versionedPath)
  if (existing !== null && existing !== plan.sha256) assertNoImmutableConflict(plan.versionedName)

  let manifestBackedUp = false
  let aliasBackedUp = false
  let aliasCreated = false
  let publicVerification: PublicDigest | null = null
  try {
    if (previous !== null) { await remote.copy(manifestPath, manifestBackup); manifestBackedUp = true }
    if (await remote.hash(aliasPath) !== null) { await remote.copy(aliasPath, aliasBackup); aliasBackedUp = true }
    if (existing === null) {
      await remote.upload(plan.sourcePath, versionedPath)
      log(`UPLOAD ${plan.versionedName} (${plan.bytes} bytes)`)
    }
    else {
      log(`KEEP ${plan.versionedName}（已存在且字节一致）`)
    }
    await remote.replaceFrom(versionedPath, aliasPath)
    aliasCreated = true
    log(`ALIAS_UPDATE ${plan.aliasName}`)
    if (plan.feedFiles !== null) {
      const directory = feedDirectory(plan.platform)
      for (const upload of plan.feedFiles.uploads) {
        const destination = `${directory}/${upload.name}`
        const remoteDigest = await remote.hash(destination)
        if (remoteDigest === upload.sha256) { log(`KEEP_FEED ${upload.name}（远端字节一致）`); continue }
        await remote.upload(upload.localPath, destination)
        log(`${remoteDigest === null ? 'UPLOAD' : 'REPLACE'}_FEED ${upload.name} (${upload.bytes} bytes)`)
      }
      await remote.writeAtomic(`${directory}/${plan.feedFiles.ymlName}`, plan.feedFiles.yml)
      log(`FEED_PUBLISHED ${plan.feedFiles.publicUrl}`)
    }
    publicVerification = await environment.fetchHash(versionedUrl)
    if (publicVerification.status !== 200 || publicVerification.sha256 !== plan.sha256 || publicVerification.bytes !== plan.bytes) {
      throw new Error(`public GET verification failed for ${versionedUrl}: status=${publicVerification.status} bytes=${publicVerification.bytes} sha256=${publicVerification.sha256}`)
    }
    const aliasProbe = await environment.head(aliasUrl)
    if (aliasProbe.status !== 200 || aliasProbe.bytes !== plan.bytes) {
      throw new Error(`public alias verification failed for ${aliasUrl}: status=${aliasProbe.status} bytes=${aliasProbe.bytes ?? '?'}`)
    }
    log(`PUBLIC_VERIFIED ${versionedUrl} status=200 bytes=${publicVerification.bytes} sha256=${publicVerification.sha256}`)
    if (plan.feedFiles !== null) {
      verifyPublishedFeed(plan.feedFiles, await environment.fetchText(plan.feedFiles.publicUrl))
      log(`FEED_VERIFIED ${plan.feedFiles.publicUrl} sha512=${plan.feedFiles.updaterSha512}`)
    }
    await remote.writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    log(`MANIFEST_UPDATED ${manifestPath}`)
  }
  catch (error) {
    const rollback: string[] = []
    const attempt = async (label: string, action: () => Promise<void>): Promise<void> => {
      try { await action(); rollback.push(`${label}=rolled-back`) }
      catch (failure) { rollback.push(`${label}=FAILED(${failure instanceof Error ? failure.message : String(failure)})`) }
    }
    if (manifestBackedUp) await attempt('manifest', () => remote.replaceFrom(manifestBackup, manifestPath))
    else if (previous === null) await attempt('manifest', () => remote.remove(manifestPath))
    if (aliasBackedUp) await attempt('alias', () => remote.replaceFrom(aliasBackup, aliasPath))
    else if (aliasCreated) await attempt('alias', () => remote.remove(aliasPath))
    log(`ROLLBACK ${rollback.length === 0 ? 'none' : rollback.join(' ')}`)
    throw new Error(`desktop downloads: publication failed: ${error instanceof Error ? error.message : String(error)}; rollback ${rollback.join(' ') || 'none'}; backups kept at ${manifestBackup}`, { cause: error })
  }

  return {
    dryRun: false,
    platformKey: plan.platformKey,
    versionedName: plan.versionedName,
    aliasName: plan.aliasName,
    sha256: plan.sha256,
    bytes: plan.bytes,
    signed: plan.signed,
    automaticUpdates: plan.manifestEntry.automatic_updates,
    changed,
    manifest,
    previousManifest: previous,
    publicVerification,
  }
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function shellPath(path: string, mode: 'parent' | 'file'): string {
  return mode === 'parent' ? quote(dirname(path)) : quote(path)
}

/**
 * @param argv Arguments after the script path.
 * @returns Validated command-line options; `execute` is true only for `--yes`.
 */
export function parsePublishArguments(argv: readonly string[]): PublishCliOptions {
  const values = new Map<string, string>()
  let feed = false
  let signed = false
  let dryRun = false
  let yes = false
  const withValue = new Set(['--platform', '--input', '--version', '--server', '--channel'])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === undefined) break
    if (argument === '--feed') { feed = true; continue }
    if (argument === '--signed') { signed = true; continue }
    if (argument === '--dry-run') { dryRun = true; continue }
    if (argument === '--yes') { yes = true; continue }
    if (!withValue.has(argument)) throw new Error(`desktop downloads: unknown argument ${argument}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`desktop downloads: ${argument} requires a value`)
    values.set(argument, value)
    index += 1
  }
  if (dryRun && yes) throw new Error('desktop downloads: --dry-run and --yes are mutually exclusive')
  const platform = values.get('--platform')
  const input = values.get('--input')
  const version = values.get('--version')
  if (platform === undefined || input === undefined || version === undefined) {
    throw new Error('Usage: tsx scripts/publish-desktop-downloads.ts --platform win-x64|mac-arm64|mac-x64 '
      + '--input <dir> --version <x.y.z> [--server root@host] [--feed] [--signed] [--channel nightly|latest] [--dry-run|--yes]')
  }
  const server = values.get('--server') ?? DEFAULT_SERVER
  if (!SERVER_PATTERN.test(server)) throw new Error(`desktop downloads: invalid --server ${JSON.stringify(server)}`)
  const channel = values.get('--channel')
  if (channel !== undefined && channel !== 'nightly' && channel !== 'latest') {
    throw new Error(`desktop downloads: invalid --channel ${JSON.stringify(channel)} (expected nightly or latest)`)
  }
  return {
    platform: resolveDownloadPlatform(platform),
    input: resolve(input),
    version: validatePublishVersion(version),
    server,
    feed,
    signed,
    channel,
    execute: yes && !dryRun,
  }
}

async function ssh(server: string, command: string, stdin?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', server, command], { stdio: ['pipe', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code: number | null) => {
      if (code === 0) resolvePromise(Buffer.concat(stdout).toString('utf8'))
      else reject(new Error(`desktop downloads: ssh failed (${String(code)}): ${Buffer.concat(stderr).toString('utf8').trim() || command}`))
    })
    child.stdin.on('error', () => undefined)
    child.stdin.end(stdin ?? '')
  })
}

function uploadOverSsh(server: string, localPath: string, destination: string): Promise<void> {
  const temporary = `${destination}.${randomUUID()}.upload`
  const command = `mkdir -p ${shellPath(destination, 'parent')} && cat > ${quote(temporary)} && mv -f ${quote(temporary)} ${quote(destination)}`
  return new Promise((resolvePromise, reject) => {
    const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', server, command], { stdio: ['pipe', 'ignore', 'pipe'] })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code: number | null) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`desktop downloads: upload to ${destination} failed (${String(code)}): ${Buffer.concat(stderr).toString('utf8').trim()}`))
    })
    child.stdin.on('error', () => undefined)
    const stream = createReadStream(localPath)
    stream.on('error', (error) => { child.kill(); reject(error) })
    stream.pipe(child.stdin)
  })
}

/** @param server SSH destination such as `root@124.223.179.250`. @returns Remote filesystem operations for the Baota download directory. */
export function createSshRemote(server: string): PublishRemote {
  return {
    async read(path) { return (await ssh(server, `if [ -f ${quote(path)} ]; then cat ${quote(path)}; fi`)) || null },
    async hash(path) {
      const output = await ssh(server, `if [ -f ${quote(path)} ]; then sha256sum ${quote(path)} | cut -d' ' -f1; fi`)
      return output.trim() === '' ? null : output.trim()
    },
    async copy(source, destination) {
      await ssh(server, `mkdir -p ${shellPath(destination, 'parent')} && cp -a ${quote(source)} ${quote(destination)}`)
    },
    async replaceFrom(source, destination) {
      const temporary = `${destination}.${randomUUID()}.tmp`
      await ssh(server, `cp -a ${quote(source)} ${quote(temporary)} && mv -f ${quote(temporary)} ${quote(destination)}`)
    },
    async writeAtomic(path, contents) {
      const temporary = `${path}.${randomUUID()}.tmp`
      await ssh(server, `mkdir -p ${shellPath(path, 'parent')} && cat > ${quote(temporary)} && mv -f ${quote(temporary)} ${quote(path)}`, contents)
    },
    async upload(localPath, destination) { await uploadOverSsh(server, localPath, destination) },
    async remove(path) { await ssh(server, `rm -f ${quote(path)}`) },
  }
}

async function openResponse(url: string, method: 'GET' | 'HEAD', redirects = 0): Promise<IncomingMessage> {
  const target = new URL(url)
  if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error(`desktop downloads: unsupported URL protocol ${target.protocol}`)
  const response = await new Promise<IncomingMessage>((resolvePromise, reject) => {
    const options = { method, headers: { 'cache-control': 'no-cache' } }
    const request = target.protocol === 'http:'
      ? httpGet(target, options, resolvePromise)
      : httpsGet(target, options, resolvePromise)
    request.on('error', reject)
    request.setTimeout(30_000, () => request.destroy(new Error('public download request timed out after 30s')))
  })
  const status = response.statusCode ?? 0
  if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
    const location = response.headers.location
    response.resume()
    if (location === undefined || redirects >= 3) throw new Error(`desktop downloads: cannot follow redirect from ${url}`)
    return openResponse(new URL(location, target).toString(), method, redirects + 1)
  }
  return response
}

/** @param url Public download URL. @returns HTTP status and Content-Length for a HEAD request. */
export async function publicHead(url: string): Promise<PublicProbe> {
  const response = await openResponse(url, 'HEAD')
  response.resume()
  const length = response.headers['content-length']
  return { status: response.statusCode ?? 0, bytes: length === undefined ? null : Number(length) }
}

/** @param url Public download URL. @returns HTTP status and streamed SHA-256 of the response body. */
export async function publicHash(url: string): Promise<PublicDigest> {
  const response = await openResponse(url, 'GET')
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    hash.update(buffer)
    bytes += buffer.length
  }
  return { status: response.statusCode ?? 0, bytes, sha256: hash.digest('hex') }
}

/** @param url Public feed URL. @returns HTTP status and the response body as text. */
export async function publicText(url: string): Promise<PublicText> {
  const response = await openResponse(url, 'GET')
  const status = response.statusCode ?? 0
  let text = ''
  for await (const chunk of response) text += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : Buffer.from(chunk).toString('utf8')
  return { status, text }
}

/** @param url Public manifest URL. @returns Parsed manifest, or null when the URL is not published. */
export async function publicManifest(url: string): Promise<DesktopManifest | null> {
  const response = await openResponse(url, 'GET')
  if ((response.statusCode ?? 0) !== 200) { response.resume(); return null }
  let text = ''
  for await (const chunk of response) text += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : Buffer.from(chunk).toString('utf8')
  return parseDesktopManifest(text)
}

async function runCli(argv: readonly string[]): Promise<void> {
  const options = parsePublishArguments(argv)
  const plan = await createPublishPlan({
    platform: options.platform,
    input: options.input,
    version: options.version,
    server: options.server,
    feed: options.feed,
    signed: options.signed,
    channel: options.channel,
    publicOrigin: PUBLIC_ORIGIN,
  })
  const outcome = await applyPublishPlan(plan, {
    remote: options.execute ? createSshRemote(options.server) : undefined,
    dryRun: !options.execute,
    now: new Date(),
    head: publicHead,
    fetchHash: publicHash,
    fetchText: publicText,
    fetchManifest: () => publicManifest(`${PUBLIC_ORIGIN}/mammoth-latest.json`),
    log: (line) => { console.log(line) },
  })
  console.log(options.execute
    ? `PUBLISHED ${outcome.versionedName} (${outcome.bytes} bytes, channel=${plan.channel}, signed=${outcome.signed}, automatic_updates=${outcome.automaticUpdates})`
    : 'DRY_RUN complete: no remote writes')
}

if (import.meta.main) await runCli(process.argv.slice(2))
