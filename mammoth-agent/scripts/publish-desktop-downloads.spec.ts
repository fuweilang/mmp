import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dump, load } from 'js-yaml'
import { afterEach, expect, it } from 'vitest'
import {
  applyPublishPlan,
  assertNoImmutableConflict,
  createFeedPublication,
  createPublishPlan,
  describeManifestChange,
  formatTimestamp,
  isNsisInstaller,
  mergeDesktopManifest,
  parseDesktopManifest,
  parsePeMachine,
  parsePublishArguments,
  readInstallerJsonSignature,
  resolveArtifactSigned,
  resolveDownloadNames,
  resolveFeedMetadataName,
  resolveManifestEntry,
  resolvePublishChannel,
  resolveRecordedChannel,
  validateDesktopArtifactName,
  verifyPublishedFeed,
  type DesktopManifestEntry,
  type FeedPublication,
  type PublishPlan,
  type PublishRemote,
} from './publish-desktop-downloads.ts'

const PUBLIC_ORIGIN = 'https://www.mmai.vip/downloads'
const MANIFEST_PATH = '/www/mmp-prod/downloads/mammoth-latest.json'
const directories: string[] = []
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })

function sha256(contents: Buffer | string): string {
  return createHash('sha256').update(contents).digest('hex')
}

function sha512Base64(contents: Buffer | string): string {
  return createHash('sha512').update(contents).digest('base64')
}

function peImage(machine: number): Buffer {
  const image = Buffer.alloc(0x200, 0x41)
  image.writeUInt16LE(0x5a4d, 0)
  image.writeUInt32LE(0x40, 0x3c)
  image.writeUInt32LE(0x00004550, 0x40)
  image.writeUInt16LE(machine, 0x44)
  return image
}

async function fixture(options: { signed?: boolean; feed?: boolean } = {}): Promise<{
  directory: string
  name: string
  bytes: Buffer
  plan: PublishPlan
}> {
  const directory = await mkdtemp(join(tmpdir(), 'mmp-downloads-unit-'))
  directories.push(directory)
  const name = 'mammoth-ai-0.3.3-win-x64-unsigned.exe'
  const bytes = peImage(0x8664)
  await writeFile(join(directory, name), bytes)
  if (options.signed) await writeFile(join(directory, 'installer.json'), JSON.stringify({ signed: true }))
  if (options.feed) {
    const digest = sha512Base64(bytes)
    await writeFile(join(directory, 'latest.yml'), dump({
      version: '0.3.3',
      files: [{ url: name, sha512: digest, size: bytes.length }],
      path: name,
      sha512: digest,
    }))
    await writeFile(join(directory, `${name}.blockmap`), 'blockmap')
  }
  const plan = await createPublishPlan({
    platform: 'win-x64',
    input: directory,
    version: '0.3.3',
    server: 'root@example.test',
    feed: options.feed ?? false,
    signed: options.signed ?? false,
    channel: undefined,
    publicOrigin: PUBLIC_ORIGIN,
  })
  return { directory, name, bytes, plan }
}

/**
 * @param options Feed channel, version, and whether the update zip exists.
 * @returns A macOS artifact directory with the dmg, zip, blockmap, and channel metadata packaging writes.
 */
async function macFixture(options: { channel?: 'nightly' | 'latest'; version?: string; withZip?: boolean; withMetadata?: boolean } = {}): Promise<{
  directory: string
  dmg: string
  zip: string | undefined
  metadataName: string
  feed: FeedPublication
}> {
  const directory = await mkdtemp(join(tmpdir(), 'mmp-downloads-mac-'))
  directories.push(directory)
  const version = options.version ?? '0.3.4'
  const channel = options.channel ?? 'latest'
  const base = `mammoth-ai-${version}-mac-arm64`
  const zip = options.withZip === false ? undefined : join(directory, `${base}.zip`)
  const zipBytes = Buffer.from('mac update zip')
  if (zip !== undefined) {
    await writeFile(zip, zipBytes)
    await writeFile(`${zip}.blockmap`, 'blockmap')
  }
  const dmg = join(directory, `${base}.dmg`)
  await writeFile(dmg, 'dmg bytes')
  const metadataName = resolveFeedMetadataName('mac-arm64', version, channel)
  if (options.withMetadata !== false) {
    await writeFile(join(directory, metadataName), dump({
      version,
      files: [{ url: `${base}.zip`, sha512: sha512Base64(zipBytes), size: zipBytes.length }],
      path: `${base}.zip`,
      sha512: sha512Base64(zipBytes),
    }))
  }
  const feed = await createFeedPublication({
    input: directory,
    platform: 'mac-arm64',
    version,
    channel,
    installer: dmg,
    publishedUrl: `${PUBLIC_ORIGIN}/mammoth-agent-mac-arm64-${version}-deadbeef.dmg`,
    publicOrigin: PUBLIC_ORIGIN,
  })
  return { directory, dmg, zip, metadataName, feed }
}

interface FakeRemote extends PublishRemote {
  readonly files: Map<string, Buffer>
}

function fakeRemote(
  seed: Record<string, string | Buffer> = {},
  options: { failManifestWrite?: boolean; failUpload?: boolean } = {},
): FakeRemote {
  const files = new Map<string, Buffer>()
  for (const [path, contents] of Object.entries(seed)) files.set(path, Buffer.from(contents))
  return {
    files,
    async read(path) { const value = files.get(path); return value === undefined ? null : value.toString('utf8') },
    async hash(path) { const value = files.get(path); return value === undefined ? null : sha256(value) },
    async copy(source, destination) {
      const value = files.get(source)
      if (value === undefined) throw new Error(`missing ${source}`)
      files.set(destination, Buffer.from(value))
    },
    async replaceFrom(source, destination) {
      const value = files.get(source)
      if (value === undefined) throw new Error(`missing ${source}`)
      files.set(destination, Buffer.from(value))
    },
    async writeAtomic(path, contents) {
      if (options.failManifestWrite === true && path === MANIFEST_PATH) throw new Error('simulated manifest write failure')
      files.set(path, Buffer.from(contents))
    },
    async upload(localPath, destination) {
      if (options.failUpload === true) throw new Error('simulated upload failure')
      files.set(destination, await readFile(localPath))
    },
    async remove(path) { files.delete(path) },
  }
}

function manifestWith(win: DesktopManifestEntry | null): string {
  return JSON.stringify({
    product: 'mammoth-agent',
    schema_version: 2,
    updated_at: '2026-11-12T17:40:56.000Z',
    platforms: {
      'darwin-arm64': {
        shell: { version: '0.3.3' }, file: 'mammoth-agent-mac-arm64.dmg', sha256: 'a'.repeat(64),
        bytes: 1, signed: false, automatic_updates: false,
      },
      ...(win === null ? {} : { 'windows-amd64': win }),
    },
  }, null, 2)
}

function environment(remote: PublishRemote | undefined, plan: PublishPlan, logs: string[], feedText?: string) {
  return {
    remote,
    dryRun: remote === undefined,
    now: new Date('2026-11-13T05:06:07.000Z'),
    head: async () => ({ status: 200, bytes: plan.bytes }),
    fetchHash: async () => ({ status: 200, bytes: plan.bytes, sha256: plan.sha256 }),
    fetchText: async () => ({ status: 200, text: feedText ?? plan.feedFiles?.yml ?? '' }),
    fetchManifest: async () => null,
    log: (line: string) => { logs.push(line) },
  }
}

it('parses CLI arguments with dry run as the default and rejects ambiguous modes', () => {
  expect(parsePublishArguments(['--platform', 'win-x64', '--input', '/tmp/win-out', '--version', '0.3.3'])).toMatchObject({
    platform: 'win-x64', version: '0.3.3', feed: false, execute: false, server: 'root@124.223.179.250',
  })
  expect(parsePublishArguments(['--platform', 'mac-arm64', '--input', '.', '--version', '0.3.3', '--feed', '--signed', '--channel', 'nightly', '--yes'])).toMatchObject({
    feed: true, signed: true, channel: 'nightly', execute: true,
  })
  expect(parsePublishArguments(['--platform', 'win-x64', '--input', '.', '--version', '0.3.3'])).toMatchObject({
    signed: false, channel: undefined,
  })
  expect(() => parsePublishArguments(['--platform', 'win-x64', '--input', '.', '--version', '0.3.3', '--channel', 'beta']))
    .toThrow(/invalid --channel/u)
  expect(() => parsePublishArguments(['--platform', 'win-x64', '--input', '.', '--version', '0.3.3', '--dry-run', '--yes']))
    .toThrow(/mutually exclusive/u)
  expect(() => parsePublishArguments(['--platform', 'linux-x64', '--input', '.', '--version', '0.3.3'])).toThrow(/unsupported platform/u)
  expect(() => parsePublishArguments(['--platform', 'win-x64', '--version', '0.3.3'])).toThrow(/Usage/u)
  expect(() => parsePublishArguments(['--platform', 'win-x64', '--input', '.', '--version', '0.3.3', '--bogus'])).toThrow(/unknown argument/u)
  expect(() => parsePublishArguments(['--platform', 'win-x64', '--input', '.', '--version', 'v0.3.3'])).toThrow(/invalid version/u)
  expect(() => parsePublishArguments(['--platform', 'win-x64', '--input', '.', '--version', '0.3.3', '--server', 'root@bad host'])).toThrow(/invalid --server/u)
})

it('derives the published versioned filename and fixed alias from the shared artifact stem', () => {
  const short = 'cb39f292' + '0'.repeat(56)
  expect(resolveDownloadNames('win-x64', '0.3.3', short)).toEqual({
    platformKey: 'windows-amd64',
    versioned: 'mammoth-agent-win-x64-0.3.3-cb39f292.exe',
    alias: 'mammoth-agent-win.exe',
  })
  expect(resolveDownloadNames('mac-arm64', '0.3.3', short)).toEqual({
    platformKey: 'darwin-arm64',
    versioned: 'mammoth-agent-mac-arm64-0.3.3-cb39f292.dmg',
    alias: 'mammoth-agent-mac-arm64.dmg',
  })
  expect(() => resolveDownloadNames('win-x64', '0.3.3', 'not-a-hash')).toThrow(/SHA-256/u)
})

it('accepts only the expected artifact name for the selected target', () => {
  validateDesktopArtifactName('mammoth-ai-0.3.3-win-x64-unsigned.exe', 'win-x64', '0.3.3')
  validateDesktopArtifactName('mammoth-ai-0.3.3-win-x64.exe', 'win-x64', '0.3.3')
  expect(() => { validateDesktopArtifactName('mammoth-ai-0.3.2-win-x64-unsigned.exe', 'win-x64', '0.3.3') })
    .toThrow(/not win-x64 0\.3\.3/u)
  expect(() => { validateDesktopArtifactName('mammoth-ai-0.3.3-mac-arm64-unsigned.dmg', 'win-x64', '0.3.3') })
    .toThrow(/not win-x64/u)
})

it('accepts the 32-bit NSIS stub while keeping the x64 target authoritative', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mmp-downloads-nsis-'))
  directories.push(directory)
  const name = 'mammoth-ai-0.3.3-win-x64-unsigned.exe'
  const stub = Buffer.concat([peImage(0x014c), Buffer.from('NullsoftInst', 'latin1')])
  await writeFile(join(directory, name), stub)
  const plan = await createPublishPlan({
    platform: 'win-x64', input: directory, version: '0.3.3', server: 'root@example.test', feed: false, signed: false, channel: undefined, publicOrigin: PUBLIC_ORIGIN,
  })
  expect(isNsisInstaller(stub)).toBe(true)
  expect(plan.warnings[0]).toMatch(/i386 stub/u)
  expect(plan.sha256).toBe(sha256(stub))
})

it('reads the PE machine field and rejects non-x64 Windows binaries', () => {
  expect(parsePeMachine(peImage(0x8664))).toBe(0x8664)
  expect(parsePeMachine(peImage(0x014c))).toBe(0x014c)
  expect(() => parsePeMachine(Buffer.alloc(8))).toThrow(/truncated DOS header/u)
  expect(() => parsePeMachine(Buffer.alloc(0x50))).toThrow(/missing MZ signature/u)
})

it('merges only the selected platform and preserves every other manifest entry', () => {
  const darwin = { shell: { version: '0.3.2' }, file: 'mammoth-agent-mac-arm64.dmg', sha256: 'b'.repeat(64), bytes: 42, signed: false, automatic_updates: false }
  const previous = JSON.parse(manifestWith(darwin)) as Parameters<typeof mergeDesktopManifest>[0]
  const entry: DesktopManifestEntry = {
    shell: { version: '0.3.3' }, file: 'mammoth-agent-win-x64-0.3.3-cb39f292.exe', sha256: 'c'.repeat(64),
    bytes: 314369394, signed: false, automatic_updates: false,
  }
  const merged = mergeDesktopManifest(previous, 'windows-amd64', entry, '2026-11-13T05:06:07.000Z')
  expect(merged.updated_at).toBe('2026-11-13T05:06:07.000Z')
  expect(merged.platforms['darwin-arm64']).toEqual(previous?.platforms['darwin-arm64'])
  expect(merged.platforms['windows-amd64']).toEqual(entry)
  expect(parseDesktopManifest(JSON.stringify(merged))).toEqual(merged)
  expect(() => parseDesktopManifest('[]')).toThrow(/must be an object/u)
  expect(() => parseDesktopManifest('{"product":"mammoth-agent","schema_version":1,"updated_at":"x","platforms":{}}')).toThrow(/schema_version/u)
})

it('never allows automatic updates for an unsigned or feedless artifact', () => {
  const base = { version: '0.3.3', file: 'file.exe', sha256: 'd'.repeat(64), bytes: 10 }
  expect(resolveManifestEntry({ ...base, signed: false, feed: true })).toMatchObject({
    entry: { signed: false, automatic_updates: false }, warnings: ['SIGNED=false: automatic_updates 强制为 false；签名前不得开启自动更新'],
  })
  expect(resolveManifestEntry({ ...base, signed: true, feed: true })).toMatchObject({
    entry: { signed: true, automatic_updates: true }, warnings: [],
  })
  expect(resolveManifestEntry({ ...base, signed: true, feed: false })).toMatchObject({
    entry: { automatic_updates: false }, warnings: ['SIGNED=true 但未选择 --feed：没有更新源，automatic_updates 保持 false'],
  })
  expect(() => resolveManifestEntry({ ...base, bytes: 0, signed: false, feed: false })).toThrow(/positive integer/u)
})

it('describes manifest field changes for the dry-run diff', () => {
  const after: DesktopManifestEntry = {
    shell: { version: '0.3.3' }, file: 'new.exe', sha256: 'e'.repeat(64), bytes: 10, signed: false, automatic_updates: false,
  }
  expect(describeManifestChange(undefined, after)).toHaveLength(6)
  expect(describeManifestChange(after, after)).toEqual(['unchanged'])
  const before = { ...after, file: 'old.exe', bytes: 9 }
  expect(describeManifestChange(before, after)).toEqual(['file: "old.exe" -> "new.exe"', 'bytes: 9 -> 10'])
  let conflict: string | null = null
  expect(() => { assertNoImmutableConflict(conflict) }).not.toThrow()
  conflict = 'mammoth-agent-win-x64-0.3.3-cb39f292.exe'
  expect(() => { assertNoImmutableConflict(conflict) }).toThrow(/different bytes/u)
})

it('validates the update feed against the installer and rewrites its URL', async () => {
  const { plan } = await fixture({ signed: true, feed: true })
  expect(plan.manifestEntry.automatic_updates).toBe(true)
  expect(plan.feedFiles?.ymlName).toBe('latest.yml')
  expect(plan.feedFiles?.yml).toContain(`${PUBLIC_ORIGIN}/${plan.versionedName}`)
  expect(plan.feedFiles?.uploads.map(upload => upload.name)).toEqual(['mammoth-ai-0.3.3-win-x64-unsigned.exe.blockmap'])
})

it('rejects a feed whose bytes do not match the installer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mmp-downloads-feed-'))
  directories.push(directory)
  const name = 'mammoth-ai-0.3.3-win-x64-unsigned.exe'
  const bytes = peImage(0x8664)
  await writeFile(join(directory, name), bytes)
  await writeFile(join(directory, `${name}.blockmap`), 'blockmap')
  await writeFile(join(directory, 'latest.yml'), dump({
    version: '0.3.3', files: [{ url: name, sha512: sha512Base64('other bytes'), size: bytes.length }], path: name,
  }))
  await expect(createPublishPlan({
    platform: 'win-x64', input: directory, version: '0.3.3', server: 'root@example.test', feed: true, signed: false, channel: undefined, publicOrigin: PUBLIC_ORIGIN,
  })).rejects.toThrow(/bytes do not match/u)
})

it('plans a dry run without touching the remote filesystem and reports an unchanged live manifest', async () => {
  const { plan } = await fixture()
  const live = parseDesktopManifest(manifestWith(plan.manifestEntry))
  const logs: string[] = []
  const outcome = await applyPublishPlan(plan, {
    remote: undefined,
    dryRun: true,
    now: new Date('2026-11-13T05:06:07.000Z'),
    head: async () => ({ status: 200, bytes: plan.bytes }),
    fetchHash: async () => { throw new Error('dry run must not read public bytes') },
    fetchText: async () => { throw new Error('dry run must not read the public feed') },
    fetchManifest: async () => live,
    log: (line) => { logs.push(line) },
  })
  expect(outcome.dryRun).toBe(true)
  expect(outcome.changed).toEqual(['unchanged'])
  expect(outcome.publicVerification).toBeNull()
  expect(logs).toContain(`TARGETFILE ${plan.versionedName}`)
  expect(logs).toContain('AUTOMATIC_UPDATES false')
  expect(logs).toContain('MODE dry-run（不写入远端；--yes 才发布）')
  expect(logs.some(line => line.startsWith('PUBLIC https://www.mmai.vip/downloads/'))).toBe(true)
})

it('publishes the versioned file, alias, feed, and merged manifest before verifying public bytes', async () => {
  const { plan, bytes } = await fixture({ signed: true, feed: true })
  const live = manifestWith(null)
  const aliasPath = '/www/mmp-prod/downloads/mammoth-agent-win.exe'
  const remote = fakeRemote({ [MANIFEST_PATH]: live, [aliasPath]: 'old alias' })
  const logs: string[] = []
  const outcome = await applyPublishPlan(plan, environment(remote, plan, logs))
  expect(outcome.dryRun).toBe(false)
  expect(outcome.publicVerification?.sha256).toBe(plan.sha256)
  expect(remote.files.get(`/www/mmp-prod/downloads/${plan.versionedName}`)).toEqual(bytes)
  expect(remote.files.get(aliasPath)).toEqual(bytes)
  const feedYml = plan.feedFiles?.yml
  expect(feedYml).toBeDefined()
  expect(remote.files.get('/www/mmp-prod/downloads/mmp-desk/feeds/win-x64/latest.yml'))
    .toEqual(Buffer.from(feedYml ?? ''))
  const manifestBytes = remote.files.get(MANIFEST_PATH)
  expect(manifestBytes).toBeDefined()
  const published = parseDesktopManifest(manifestBytes?.toString('utf8') ?? '')
  expect(published.platforms['windows-amd64']).toEqual(plan.manifestEntry)
  expect(published.platforms['darwin-arm64']).toMatchObject({ file: 'mammoth-agent-mac-arm64.dmg' })
  expect(remote.files.get(`${MANIFEST_PATH}.prev-20261113-050607`)?.toString('utf8')).toBe(live)
  expect(remote.files.get(`${aliasPath}.prev-20261113-050607`)?.toString('utf8')).toBe('old alias')
  expect(logs).toContain(`MANIFEST_UPDATED ${MANIFEST_PATH}`)
  expect(logs.some(line => line.startsWith('FEED_VERIFIED https://www.mmai.vip/downloads/mmp-desk/feeds/win-x64/latest.yml'))).toBe(true)
})

it('names channel metadata for the stable and nightly electron-updater channels', () => {
  expect(resolveFeedMetadataName('mac-arm64', '0.3.4', 'latest')).toBe('latest-mac.yml')
  expect(resolveFeedMetadataName('mac-arm64', '0.3.4', 'nightly')).toBe('nightly-mac.yml')
  expect(resolveFeedMetadataName('mac-x64', '0.3.4-beta.1', 'nightly')).toBe('nightly-mac.yml')
  expect(resolveFeedMetadataName('win-x64', '0.3.4', 'latest')).toBe('latest.yml')
  expect(resolveFeedMetadataName('win-x64', '0.3.4', 'nightly')).toBe('nightly.yml')
})

it('derives the channel from version stability and refuses latest for a prerelease', () => {
  expect(resolvePublishChannel('0.3.4', undefined)).toBe('latest')
  expect(resolvePublishChannel('0.3.4-beta.1', undefined)).toBe('nightly')
  expect(resolvePublishChannel('0.3.4', 'nightly')).toBe('nightly')
  expect(() => resolvePublishChannel('0.3.4-beta.1', 'latest')).toThrow(/stable version/u)
})

it('reads the packaged channel record and rejects a channel or version mismatch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mmp-downloads-channel-'))
  directories.push(directory)
  await writeFile(join(directory, 'mac-arm64-release.json'), JSON.stringify({ schemaVersion: 1, target: 'mac-arm64', version: '0.3.4', channel: 'nightly' }))
  expect(await resolveRecordedChannel(directory, 'mac-arm64', '0.3.4', undefined)).toBe('nightly')
  expect(await resolveRecordedChannel(directory, 'mac-arm64', '0.3.4', 'nightly')).toBe('nightly')
  await expect(resolveRecordedChannel(directory, 'mac-arm64', '0.3.4', 'latest')).rejects.toThrow(/does not match the packaged nightly channel/u)
  await expect(resolveRecordedChannel(directory, 'mac-arm64', '0.3.5', undefined)).rejects.toThrow(/records version 0\.3\.4/u)
  expect(await resolveRecordedChannel(directory, 'win-x64', '0.3.4', undefined)).toBe('latest')
})

it('derives macOS signing from packaging evidence, the operator flag, and the update zip', async () => {
  expect(resolveArtifactSigned({ recorded: true, platform: 'mac-arm64', signedFlag: false, updateFilePresent: false })).toBe(true)
  expect(resolveArtifactSigned({ recorded: false, platform: 'mac-arm64', signedFlag: true, updateFilePresent: true })).toBe(false)
  expect(resolveArtifactSigned({ recorded: undefined, platform: 'mac-arm64', signedFlag: false, updateFilePresent: true })).toBe(false)
  expect(resolveArtifactSigned({ recorded: undefined, platform: 'mac-arm64', signedFlag: true, updateFilePresent: true })).toBe(true)
  expect(() => resolveArtifactSigned({ recorded: undefined, platform: 'mac-arm64', signedFlag: true, updateFilePresent: false }))
    .toThrow(/requires the update zip/u)
  expect(() => resolveArtifactSigned({ recorded: undefined, platform: 'win-x64', signedFlag: true, updateFilePresent: true }))
    .toThrow(/applies to macOS/u)
  expect(resolveArtifactSigned({ recorded: undefined, platform: 'win-x64', signedFlag: false, updateFilePresent: true })).toBe(false)
  const directory = await mkdtemp(join(tmpdir(), 'mmp-downloads-signed-'))
  directories.push(directory)
  expect(await readInstallerJsonSignature(directory)).toBeUndefined()
  await writeFile(join(directory, 'installer.json'), JSON.stringify({ signed: true }))
  expect(await readInstallerJsonSignature(directory)).toBe(true)
})

it('publishes the macOS zip before its channel metadata and verifies the public feed', async () => {
  const { dmg, feed } = await macFixture({ channel: 'nightly' })
  const dmgBytes = await readFile(dmg)
  const zipBytes = await readFile(feed.uploads[0]?.localPath ?? '')
  const sha256 = createHash('sha256').update(dmgBytes).digest('hex')
  const versionedName = 'mammoth-agent-mac-arm64-0.3.4-abcdef12.dmg'
  expect(resolveFeedMetadataName('mac-arm64', '0.3.4', feed.channel)).toBe(feed.ymlName)
  expect(feed.ymlName).toBe('nightly-mac.yml')
  expect(feed.updaterName).toBe('mammoth-ai-0.3.4-mac-arm64.zip')
  expect(feed.updaterUrl).toBe(`${PUBLIC_ORIGIN}/mmp-desk/feeds/mac-arm64/mammoth-ai-0.3.4-mac-arm64.zip`)
  expect(feed.uploads.map(upload => upload.name)).toEqual([
    'mammoth-ai-0.3.4-mac-arm64.zip',
    'mammoth-ai-0.3.4-mac-arm64.zip.blockmap',
  ])
  const metadata = load(feed.yml) as { files: { url: string; sha512: string; size: number }[] }
  expect(metadata.files[0]).toMatchObject({ url: feed.updaterUrl, sha512: sha512Base64(zipBytes), size: zipBytes.length })
  verifyPublishedFeed(feed, { status: 200, text: feed.yml })
  expect(() => verifyPublishedFeed(feed, { status: 404, text: '' })).toThrow(/status=404/u)
  expect(() => verifyPublishedFeed(feed, { status: 200, text: feed.yml.replace(feed.updaterSha512, sha512Base64('stale')) }))
    .toThrow(/does not describe/u)
  const plan: PublishPlan = {
    platform: 'mac-arm64', version: '0.3.4', channel: 'nightly', server: 'root@example.test', publicOrigin: PUBLIC_ORIGIN,
    sourcePath: dmg, versionedName, aliasName: 'mammoth-agent-mac-arm64.dmg',
    platformKey: 'darwin-arm64', sha256, bytes: dmgBytes.length, signed: true, feed: true, feedFiles: feed, warnings: [],
    manifestEntry: { shell: { version: '0.3.4' }, file: versionedName, sha256, bytes: dmgBytes.length, signed: true, automatic_updates: true },
  }
  const feedZip = `/www/mmp-prod/downloads/mmp-desk/feeds/mac-arm64/${feed.uploads[0]?.name ?? ''}`
  const remote = fakeRemote({ [feedZip]: 'stale zip bytes' })
  const logs: string[] = []
  const outcome = await applyPublishPlan(plan, environment(remote, plan, logs))
  expect(outcome.automaticUpdates).toBe(true)
  expect(remote.files.get(feedZip)).toEqual(zipBytes)
  expect(remote.files.get('/www/mmp-prod/downloads/mmp-desk/feeds/mac-arm64/mammoth-ai-0.3.4-mac-arm64.zip.blockmap'))
    .toEqual(Buffer.from('blockmap'))
  expect(remote.files.get('/www/mmp-prod/downloads/mmp-desk/feeds/mac-arm64/nightly-mac.yml')).toEqual(Buffer.from(feed.yml))
  expect(logs).toContain('REPLACE_FEED mammoth-ai-0.3.4-mac-arm64.zip (14 bytes)')
  expect(logs).toContain('UPLOAD_FEED mammoth-ai-0.3.4-mac-arm64.zip.blockmap (8 bytes)')
  expect(logs.some(line => line.startsWith('FEED_VERIFIED https://www.mmai.vip/downloads/mmp-desk/feeds/mac-arm64/nightly-mac.yml'))).toBe(true)
})

it('rejects a macOS feed whose metadata names an absent update zip', async () => {
  await expect(macFixture({ withZip: false })).rejects.toThrow(/missing update file/u)
})

it('rejects a macOS feed when packaging wrote a different channel', async () => {
  await expect(macFixture({ channel: 'nightly', withMetadata: false })).rejects.toThrow(/requires .*nightly-mac\.yml/u)
})

it('restores the manifest and alias from their .prev backups when the manifest write fails', async () => {
  const { plan } = await fixture()
  const live = manifestWith(null)
  const aliasPath = '/www/mmp-prod/downloads/mammoth-agent-win.exe'
  const remote = fakeRemote({ [MANIFEST_PATH]: live, [aliasPath]: 'old alias' }, { failManifestWrite: true })
  const logs: string[] = []
  await expect(applyPublishPlan(plan, environment(remote, plan, logs)))
    .rejects.toThrow(/publication failed.*simulated manifest write failure.*rollback/u)
  expect(remote.files.get(MANIFEST_PATH)?.toString('utf8')).toBe(live)
  expect(remote.files.get(aliasPath)?.toString('utf8')).toBe('old alias')
  expect(remote.files.get(`${MANIFEST_PATH}.prev-20261113-050607`)?.toString('utf8')).toBe(live)
  expect(logs).toContain('ROLLBACK manifest=rolled-back alias=rolled-back')
})

it('leaves the manifest and alias untouched when the versioned upload fails', async () => {
  const { plan } = await fixture()
  const live = manifestWith(null)
  const aliasPath = '/www/mmp-prod/downloads/mammoth-agent-win.exe'
  const remote = fakeRemote({ [MANIFEST_PATH]: live, [aliasPath]: 'old alias' }, { failUpload: true })
  await expect(applyPublishPlan(plan, environment(remote, plan, []))).rejects.toThrow(/simulated upload failure/u)
  expect(remote.files.get(MANIFEST_PATH)?.toString('utf8')).toBe(live)
  expect(remote.files.get(aliasPath)?.toString('utf8')).toBe('old alias')
})

it('refuses to replace an immutable versioned file with different bytes', async () => {
  const { plan } = await fixture()
  const versionedPath = `/www/mmp-prod/downloads/${plan.versionedName}`
  const remote = fakeRemote({ [versionedPath]: 'other release bytes' })
  await expect(applyPublishPlan(plan, environment(remote, plan, []))).rejects.toThrow(/already exists with different bytes/u)
  expect(remote.files.get(versionedPath)?.toString('utf8')).toBe('other release bytes')
})

it('formats UTC backup suffixes from the publication clock', () => {
  expect(formatTimestamp(new Date('2026-11-13T05:06:07.000Z'))).toBe('20261113-050607')
})
