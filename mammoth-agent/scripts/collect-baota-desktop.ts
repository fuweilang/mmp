import { copyImmutableDesktopArtifact, replaceDesktopInstallerAlias, writeDesktopMetadataAtomic } from './baota-desktop-publication.ts'
/** Collect validated local Desktop artifacts for Baota without COS, GitHub or network writes. */
import { mkdir, readFile, stat, readdir } from 'node:fs/promises'
import { createReadStream, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { createDesktopUploadPlan } from '../apps/desktop/scripts/desktop-upload-plan.ts'
import type { DesktopPackageTargetName } from '../apps/desktop/scripts/package-target.ts'

const names = { 'mac-arm64': 'mammoth-agent-mac-arm64.dmg', 'mac-x64': 'mammoth-agent-mac-x64.dmg', 'win-x64': 'mammoth-agent-win.exe' } as const
const platformKeys = { 'mac-arm64': 'darwin-arm64', 'mac-x64': 'darwin-amd64', 'win-x64': 'windows-amd64' } as const
const [target, input, destination] = process.argv.slice(2)
if (!target || !Object.hasOwn(names, target) || !input || !destination) throw new Error('Usage: tsx scripts/collect-baota-desktop.ts mac-arm64|mac-x64|win-x64 ARTIFACTS_DIR RELEASE_DIR')
const selected = target as DesktopPackageTargetName
async function checksum(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}

/** Electron nests the bundle under an architecture directory whose name varies by target. */
async function findAppBundle(dir: string, depth = 0): Promise<string | undefined> {
  if (depth > 2) return undefined
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const full = join(dir, entry.name)
    if (entry.name.endsWith('.app')) return full
    const nested = await findAppBundle(full, depth + 1)
    if (nested !== undefined) return nested
  }
  return undefined
}
if (process.argv[5] === '--unsigned-test') {
  if (!selected.startsWith('mac-') || process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Unsigned test collection requires this Apple Silicon Mac')
  const expectedArch = selected === 'mac-arm64' ? 'arm64' : 'x86_64'
  const app = await findAppBundle(resolve(input))
  if (app === undefined) throw new Error(`Missing .app bundle in ${input}`)
  const info = join(app, 'Contents', 'Info.plist')
  const plist = (key: string) => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, info], { encoding: 'utf8' }).trim()
  const bundleId = plist('CFBundleIdentifier')
  // Unsigned local builds carry the harness identity; the signed production build carries the
  // product identity. Both are continuous with the currently published app; the retired Octop
  // identity must never ship.
  if (bundleId === 'com.tencent.octop' || !/^com\.(mammoth|deepseek)\.[a-z0-9.]+$/u.test(bundleId)) throw new Error(`Unexpected application identity: ${bundleId}`)
  const binaryArchs = execFileSync('lipo', ['-archs', join(app, 'Contents', 'MacOS', '猛犸智能体')], { encoding: 'utf8' }).trim()
  if (!binaryArchs.split(/\s+/).includes(expectedArch)) throw new Error(`${selected} main binary is ${binaryArchs}, expected ${expectedArch}`)
  const version = plist('CFBundleShortVersionString')
  const candidates = (await readdir(resolve(input))).filter(name => name.endsWith(`-${selected}-unsigned.dmg`) && name.includes(version))
  if (candidates.length !== 1) throw new Error(`Expected exactly one matching ${selected} test installer`)
  const dmg = join(resolve(input), candidates[0]!)
  execFileSync('hdiutil', ['verify', dmg], { stdio: 'ignore' })
  const downloads = join(resolve(destination), 'downloads')
  await mkdir(downloads, { recursive: true })
  const name = names[selected]
  await replaceDesktopInstallerAlias(dmg, join(downloads, name))
  const sha256 = await checksum(dmg)
  // Merge into the existing manifest so other architectures (and any Windows entries) survive.
  const manifestPath = join(downloads, 'mammoth-latest.json')
  const manifest = existsSync(manifestPath)
    ? JSON.parse(await readFile(manifestPath, 'utf8')) as { product: string; schema_version: number; updated_at: string; platforms: Record<string, unknown> }
    : { product: 'mammoth-agent', schema_version: 2, updated_at: new Date().toISOString(), platforms: {} }
  manifest.product = 'mammoth-agent'
  manifest.schema_version = 2
  manifest.updated_at = new Date().toISOString()
  manifest.platforms[platformKeys[selected]] = { shell: { version }, file: name, sha256, bytes: (await stat(dmg)).size, signed: false, automatic_updates: false }
  await writeDesktopMetadataAtomic(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`Collected ${selected} unsigned test installer ${version}; manifest merged, other platforms preserved; no update feed or network upload.`)
  process.exit(0)
}
const plan = await createDesktopUploadPlan(selected, { artifactsRoot: resolve(input), environment: {
  MMP_DESKTOP_AUTO_UPDATE_ENV: 'production', MMP_DESKTOP_UPDATE_CHANNEL: process.env.MMP_DESKTOP_UPDATE_CHANNEL || 'nightly', DOWNLOAD_PROD_COS_BUCKET: 'baota-local-only',
} })
const root = resolve(destination)
for (const artifact of plan.artifacts) {
  if (!artifact.key.startsWith('downloads/') || artifact.key.includes('..')) throw new Error('Unexpected publication path')
  const output = join(root, artifact.key)
  await mkdir(dirname(output), { recursive: true })
  if (artifact.contents !== undefined) await writeDesktopMetadataAtomic(output, artifact.contents)
  else await copyImmutableDesktopArtifact(artifact.path, output)
}
const installer = plan.artifacts.find(item => item.path.endsWith(selected === 'win-x64' ? '.exe' : '.dmg'))
if (!installer) throw new Error('Missing verified installer')
const alias = join(root, 'downloads', names[selected])
const versionedName = installer.filename
await copyImmutableDesktopArtifact(installer.path, join(root, 'downloads', versionedName))
await replaceDesktopInstallerAlias(installer.path, alias)
const sha256 = await checksum(alias)
await writeDesktopMetadataAtomic(join(root, 'downloads', `${selected}.json`), JSON.stringify({ platform: platformKeys[selected], version: plan.version, file: versionedName, sha256, bytes: (await stat(alias)).size, branch: plan.branch, commit: plan.commit, builtAt: plan.builtAt }, null, 2))
// Merge the collected platform into the existing user-facing manifest; never rebuild it from scratch,
// so architectures built in earlier rounds and pre-existing Windows entries are preserved.
const manifestPath = join(root, 'downloads', 'mammoth-latest.json')
const platforms: Record<string, { shell: { version: string }; file: string; sha256: string; bytes?: number; branch?: string; commit?: string; builtAt?: string }> = existsSync(manifestPath)
  ? (JSON.parse(await readFile(manifestPath, 'utf8')) as { platforms?: Record<string, { shell: { version: string }; file: string; sha256: string; bytes?: number; branch?: string; commit?: string; builtAt?: string }> }).platforms ?? {}
  : {}
for (const name of Object.keys(names)) {
  try {
    const item = JSON.parse(await readFile(join(root, 'downloads', `${name}.json`), 'utf8')) as { platform: string; version: string; file: string; sha256: string; bytes?: number; branch?: string; commit?: string; builtAt?: string }
    platforms[item.platform] = { shell: { version: item.version }, file: item.file, sha256: item.sha256,
      ...(item.bytes === undefined ? {} : { bytes: item.bytes }), ...(item.branch ? { branch: item.branch } : {}),
      ...(item.commit ? { commit: item.commit } : {}), ...(item.builtAt ? { builtAt: item.builtAt } : {}) }
  } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
}
await writeDesktopMetadataAtomic(manifestPath, JSON.stringify({ product: 'mammoth-agent', schema_version: 2, updated_at: new Date().toISOString(), platforms }, null, 2))
console.log(`Collected ${selected} ${plan.version}; only local files were written.`)
