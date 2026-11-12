import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { copyImmutableDesktopArtifact, replaceDesktopInstallerAlias, writeDesktopMetadataAtomic } from './baota-desktop-publication.ts'
const directories: string[] = []
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })
it('preserves immutable bytes, allows identical retries, and advances local aliases and metadata atomically', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mmp-publication-unit-')); directories.push(dir)
  const source = join(dir, 'source'); const versioned = join(dir, 'mammoth-ai-0.3.2-mac-arm64.dmg')
  await writeFile(source, 'first version')
  await copyImmutableDesktopArtifact(source, versioned)
  await copyImmutableDesktopArtifact(source, versioned)
  await writeFile(source, 'different bytes')
  await expect(copyImmutableDesktopArtifact(source, versioned)).rejects.toThrow('different bytes')
  expect(await readFile(versioned, 'utf8')).toBe('first version')
  const alias = join(dir, 'latest.dmg'); await replaceDesktopInstallerAlias(versioned, alias)
  expect(await readFile(alias, 'utf8')).toBe('first version')
  const manifest = join(dir, 'latest.json')
  await writeDesktopMetadataAtomic(manifest, JSON.stringify({ version: '0.3.2' }))
  await writeDesktopMetadataAtomic(manifest, JSON.stringify({ version: '0.3.3' }))
  expect(JSON.parse(await readFile(manifest, 'utf8'))).toEqual({ version: '0.3.3' })
  expect((await readdir(dir)).some(name => name.endsWith('.tmp'))).toBe(false)
})
