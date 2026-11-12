/** Filesystem-only staging primitives; no network, packaging, signing, or Git operations. */
import { constants, createReadStream } from 'node:fs'
import { copyFile, rename, rm, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'

async function digest(path: string): Promise<string> {
  const hash = createHash('sha512')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return hash.digest('hex')
}

/**
 * Never replace different bytes under a published versioned name; identical retries are safe.
 * @param source Validated local binary artifact.
 * @param destination Versioned file inside a local release staging directory.
 */
export async function copyImmutableDesktopArtifact(source: string, destination: string): Promise<void> {
  try { await copyFile(source, destination, constants.COPYFILE_EXCL) }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
    if (await digest(source) !== await digest(destination)) throw new Error('desktop publication: versioned artifact already exists with different bytes')
  }
}

/**
 * Replace a local metadata pointer in one rename, never with a partially written JSON/YAML file.
 * @param destination Final metadata path in an existing staging directory.
 * @param contents Fully generated metadata, published only after binaries are staged.
 */
export async function writeDesktopMetadataAtomic(destination: string, contents: string): Promise<void> {
  const temporary = `${destination}.${randomUUID()}.tmp`
  try { await writeFile(temporary, contents, { flag: 'wx' }); await rename(temporary, destination) }
  finally { await rm(temporary, { force: true }) }
}

/**
 * Replace a stable local installer alias atomically, retaining the versioned original.
 * @param source Fully staged, validated installer.
 * @param destination Fixed-name alias for old download links.
 */
export async function replaceDesktopInstallerAlias(source: string, destination: string): Promise<void> {
  const temporary = `${destination}.${randomUUID()}.tmp`
  try { await copyFile(source, temporary, constants.COPYFILE_EXCL); await rename(temporary, destination) }
  finally { await rm(temporary, { force: true }) }
}
