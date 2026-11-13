import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { dump } from 'js-yaml'
import { afterEach, expect, it } from 'vitest'
import {
  assertPackagedUpdateConfig,
  packagedUpdateConfigPath,
  type PackagedUpdateTarget,
} from '../scripts/desktop-packaged-update-config.ts'

const MAC: PackagedUpdateTarget = { name: 'mac-arm64', platform: 'darwin', arch: 'arm64' }
const WIN: PackagedUpdateTarget = { name: 'win-x64', platform: 'win32', arch: 'x64' }
const expected = { publicUrl: 'https://www.mmai.vip/downloads/mmp-desk/feeds/mac-arm64/', channel: 'nightly' as const }
const directories: string[] = []
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })

async function packaged(config: Record<string, unknown> | string, target: PackagedUpdateTarget = MAC): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mmp-packaged-update-config-'))
  directories.push(directory)
  const path = packagedUpdateConfigPath(directory, target)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, typeof config === 'string' ? config : dump(config))
  return directory
}

it('locates the feed inside each packaged application', () => {
  expect(packagedUpdateConfigPath('/out', MAC)).toBe('/out/mac-arm64/猛犸智能体.app/Contents/Resources/app-update.yml')
  expect(packagedUpdateConfigPath('/out', { ...MAC, name: 'mac-x64', arch: 'x64' })).toBe('/out/mac/猛犸智能体.app/Contents/Resources/app-update.yml')
  expect(packagedUpdateConfigPath('/out', WIN)).toBe('/out/win-unpacked/resources/app-update.yml')
})

it('accepts a packaged feed that matches the release environment', async () => {
  const directory = await packaged({ provider: 'generic', url: expected.publicUrl, channel: 'nightly', updaterCacheDirName: 'mammoth-ai-updater' })
  expect(await assertPackagedUpdateConfig(directory, MAC, expected))
    .toEqual({ provider: 'generic', url: expected.publicUrl, channel: 'nightly' })
})

it('readmits an absent channel as the electron-updater default', async () => {
  const directory = await packaged({ provider: 'generic', url: expected.publicUrl })
  expect((await assertPackagedUpdateConfig(directory, MAC, { ...expected, channel: 'latest' })).channel).toBe('latest')
})

it('refuses a signed package whose feed is missing, off-deployment, or on another channel', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mmp-packaged-update-config-'))
  directories.push(directory)
  await expect(assertPackagedUpdateConfig(directory, MAC, expected)).rejects.toThrow(/app-update\.yml is missing/u)

  const stale = await packaged({ provider: 'generic', url: 'https://example.com/feed/', channel: 'nightly' })
  await expect(assertPackagedUpdateConfig(stale, MAC, expected)).rejects.toThrow(/expected https:\/\/www\.mmai\.vip/u)

  const otherChannel = await packaged({ provider: 'generic', url: expected.publicUrl, channel: 'latest' })
  await expect(assertPackagedUpdateConfig(otherChannel, MAC, expected)).rejects.toThrow(/channel is latest, expected nightly/u)

  const notGeneric = await packaged({ provider: 's3', url: expected.publicUrl })
  await expect(assertPackagedUpdateConfig(notGeneric, MAC, expected)).rejects.toThrow(/provider is s3/u)

  const notYaml = await packaged('provider: [')
  await expect(assertPackagedUpdateConfig(notYaml, MAC, expected)).rejects.toThrow(/is not YAML/u)
})
