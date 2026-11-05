/** Collect validated local Desktop artifacts for Baota without COS, GitHub or network writes. */
import { copyFile, mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
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
if (process.argv[5] === '--unsigned-test') {
  if (selected !== 'mac-arm64' || process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Unsigned test collection requires this Apple Silicon Mac')
  const info = join(resolve(input), 'mac-arm64', '猛犸智能体.app', 'Contents', 'Info.plist')
  const plist = (key: string) => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, info], { encoding: 'utf8' }).trim()
  if (plist('CFBundleIdentifier') !== 'com.mammoth.ai.desktop') throw new Error('Unexpected application identity')
  const version = plist('CFBundleShortVersionString')
  const candidates = (await readdir(resolve(input))).filter(name => name.endsWith('-mac-arm64-unsigned.dmg') && name.includes(version))
  if (candidates.length !== 1) throw new Error('Expected exactly one matching Apple Silicon test installer')
  const dmg = join(resolve(input), candidates[0]!)
  execFileSync('hdiutil', ['verify', dmg], { stdio: 'ignore' })
  const downloads = join(resolve(destination), 'downloads')
  await mkdir(downloads, { recursive: true })
  const name = names[selected]
  await copyFile(dmg, join(downloads, name))
  const sha256 = await checksum(dmg)
  await writeFile(join(downloads, 'mammoth-latest.json'), JSON.stringify({ product: 'mammoth-agent', schema_version: 2,
    updated_at: new Date().toISOString(), platforms: { 'darwin-arm64': { shell: { version }, file: name, sha256, signed: false, automatic_updates: false } } }, null, 2))
  console.log(`Collected Apple Silicon unsigned test installer ${version}; no update feed or network upload.`)
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
  if (artifact.contents !== undefined) await writeFile(output, artifact.contents)
  else await copyFile(artifact.path, output)
}
const installer = plan.artifacts.find(item => item.path.endsWith(selected === 'win-x64' ? '.exe' : '.dmg'))
if (!installer) throw new Error('Missing verified installer')
const alias = join(root, 'downloads', names[selected])
await copyFile(installer.path, alias)
const sha256 = await checksum(alias)
await writeFile(join(root, 'downloads', `${selected}.json`), JSON.stringify({ platform: platformKeys[selected], version: plan.version, file: names[selected], sha256 }, null, 2))
// Build the user-facing manifest from only the installers actually collected.
const platforms: Record<string, { shell: { version: string }; file: string; sha256: string }> = {}
for (const name of Object.keys(names)) {
  try {
    const item = JSON.parse(await readFile(join(root, 'downloads', `${name}.json`), 'utf8')) as { platform: string; version: string; file: string; sha256: string }
    platforms[item.platform] = { shell: { version: item.version }, file: item.file, sha256: item.sha256 }
  } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
}
await writeFile(join(root, 'downloads', 'mammoth-latest.json'), JSON.stringify({ product: 'mammoth-agent', schema_version: 2, updated_at: new Date().toISOString(), platforms }, null, 2))
console.log(`Collected ${selected} ${plan.version}; only local files were written.`)
