/** Durable, credential-free evidence for test and production Desktop uploads. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type COS from 'cos-nodejs-sdk-v5'
import type { DesktopUploadArtifact, DesktopUploadPlan } from './desktop-upload-plan.ts'
import { DESKTOP_COS_REGION } from './desktop-cos.ts'
import { recordPackagingEvent } from './packaging-run.mjs'

const FAILURE_CODES = new Set(['AccessDenied', 'InternalError', 'NoSuchBucket', 'BadDigest', 'SignatureDoesNotMatch',
  'RequestTimeout', 'TimeoutError', 'AbortError', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ENOSPC', 'EACCES', 'EPERM', 'ENOENT', 'FileAlreadyExists',
  'ObjectConflict'])

/** An immutable destination already holds different bytes; overwriting it would invalidate a published feed. */
class DesktopUploadConflict extends Error {
  readonly code = 'ObjectConflict'
}

/** Object keys fingerprinted into every upload record to bind evidence to this uploader. */
const UPLOADER_SOURCES = ['desktop-upload-run.ts', 'upload-target.ts', 'desktop-upload-plan.ts', 'desktop-cos.ts']

async function fingerprint(artifact: DesktopUploadArtifact) {
  const sha512 = createHash('sha512')
  const md5 = createHash('md5')
  let size = 0
  const source = artifact.contents === undefined ? createReadStream(artifact.path) : [Buffer.from(artifact.contents)]
  for await (const bytes of source) {
    size += bytes.length
    sha512.update(bytes)
    md5.update(bytes)
  }
  return { size, sha512: sha512.digest('base64'), md5: md5.digest('base64') }
}

function receipt(value: unknown): object {
  if (typeof value !== 'object' || value === null) return {}
  const response = value as { statusCode?: unknown; RequestId?: unknown }
  return {
    ...(typeof response.statusCode === 'number' ? { httpStatus: response.statusCode } : {}),
    ...(typeof response.RequestId === 'string' && /^[\w+/=.-]{1,256}$/u.test(response.RequestId)
      ? { requestId: response.RequestId } : {}),
  }
}

function failureReceipt(error: unknown): object {
  const codes = typeof error === 'object' && error !== null
    ? ['code' in error ? error.code : undefined, 'name' in error ? error.name : undefined] : []
  const errorCode = codes.find(code => typeof code === 'string' && FAILURE_CODES.has(code)) ?? 'UNCLASSIFIED'
  return { errorCode, ...receipt(error) }
}

function streamedBody(artifact: DesktopUploadArtifact): Readable {
  return artifact.contents === undefined
    ? createReadStream(artifact.path)
    : Readable.from([Buffer.from(artifact.contents)])
}

/** COS reports a single-part object's MD5 as a quoted lowercase hexadecimal ETag. */
function md5Hex(etag: unknown): string | undefined {
  if (typeof etag !== 'string') return undefined
  const hex = etag.replace(/^"|"$/gu, '').toLowerCase()
  return /^[0-9a-f]{32}$/u.test(hex) ? hex : undefined
}

function alreadyExists(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return ('code' in error && error.code === 'FileAlreadyExists') || ('statusCode' in error && error.statusCode === 409)
}

function missingObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return ('code' in error && error.code === 'NoSuchKey') || ('statusCode' in error && error.statusCode === 404)
}

/**
 * Compare a stored immutable object with the planned bytes so a retried upload can finish without a second write.
 * @param cos Caller-owned client from the Desktop COS factory.
 * @param bucket Destination bucket from the validated plan.
 * @param artifact Planned object with its recorded size and MD5.
 * @returns Whether the stored object carries exactly the planned bytes.
 */
async function storedObjectMatches(
  cos: COS,
  bucket: string,
  artifact: DesktopUploadArtifact & { readonly size: number; readonly md5: string },
): Promise<boolean> {
  let response: {
    ContentLength?: string | number
    ETag?: string
    /** The SDK projects HEAD headers here instead of top-level fields. */
    headers?: Record<string, string | string[] | undefined>
  }
  try {
    response = await cos.headObject({ Bucket: bucket, Region: DESKTOP_COS_REGION, Key: artifact.key })
  } catch (error) {
    if (missingObject(error)) return false
    throw error
  }
  const expected = Buffer.from(artifact.md5, 'base64').toString('hex')
  const length = response.ContentLength ?? response.headers?.['content-length']
  return Number(length) === artifact.size && md5Hex(response.ETag) === expected
}

/**
 * Separate mutable feed/pointer caching from versioned binary caching.
 * COS overwrite protection requires bucket versioning to be disabled (release prerequisite).
 * @param artifact Validated final destination, not caller-supplied HTTP headers.
 * @returns Headers stored on the object; never authorization or credentials.
 */
export function desktopUploadObjectHeaders(artifact: Pick<DesktopUploadArtifact, 'key' | 'channelMetadata'>): Record<string, string> {
  if (artifact.channelMetadata || artifact.key.startsWith('desktop/')) return { 'Cache-Control': 'no-store' }
  return { 'Cache-Control': 'public, max-age=86400', 'x-cos-forbid-overwrite': 'true' }
}

/**
 * Upload an already validated installer or update plan, flushing intent and response evidence around every PUT.
 *
 * Each object is sent as one streamed PUT with an explicit length and Content-MD5, which is also
 * what keeps the COS SDK's internal retry path unreachable: it repeats a request only when the
 * body is not a stream. This function never retries either, so every confirmed PUT is the only
 * write for its key. Overwrite-protected keys accept an existing object only when HEAD shows the
 * planned bytes, so an upload rerun after a lost response is idempotent instead of a 409.
 * @param plan Validated release metadata; credential values must not be included.
 * @param cos Caller-owned client from the Desktop COS factory in `desktop-cos.ts`.
 * @param recordsRoot Local retained evidence parent, outside disposable artifact directories.
 * @returns Fresh record directory after all PUTs succeed; errors retain partial evidence and stop later PUTs.
 */
export async function uploadDesktopRelease(plan: DesktopUploadPlan, cos: COS, recordsRoot: string): Promise<string> {
  await mkdir(recordsRoot, { recursive: true })
  const directory = await mkdtemp(join(recordsRoot, `${plan.environment}-${plan.target}-`))
  process.stdout.write(`desktop upload: record ${directory}\n`)
  const startedAt = new Date().toISOString()
  let stage = 'prepare'
  let key: string | undefined
  let confirmedPuts = 0
  let success = false
  let failure: object | undefined
  try {
    await writeFile(join(directory, 'events.jsonl'), '', { flag: 'wx', mode: 0o600, flush: true })
    recordPackagingEvent(directory, { type: 'upload-start', environment: plan.environment, target: plan.target, version: plan.version })
    const artifacts = []
    for (const artifact of plan.artifacts) {
      stage = 'hash-input'
      key = artifact.key
      artifacts.push({ ...artifact, ...await fingerprint(artifact) })
    }
    const sourceSha256: Record<string, string> = {}
    for (const filename of UPLOADER_SOURCES) {
      sourceSha256[filename] = createHash('sha256').update(await readFile(join(import.meta.dirname, filename))).digest('hex')
    }
    await writeFile(join(directory, 'plan.json'), `${JSON.stringify({ schemaVersion: 1,
      environment: plan.environment, target: plan.target, version: plan.version, bucket: plan.bucket,
      publicUrl: plan.publicUrl, maxAttempts: 1,
      ...(plan.commit ? { commit: plan.commit } : {}), ...(plan.branch ? { branch: plan.branch } : {}),
      ...(plan.builtAt ? { builtAt: plan.builtAt } : {}), sourceSha256, artifacts }, null, 2)}\n`, { flag: 'wx', mode: 0o600, flush: true })
    for (const artifact of artifacts) {
      key = artifact.key
      stage = 'verify-input'
      const current = await fingerprint(artifact)
      if (current.sha512 !== artifact.sha512 || current.size !== artifact.size) throw new Error('desktop upload: input changed')
      stage = 'put'
      let skipped = false
      recordPackagingEvent(directory, { type: 'put-intent', key, size: artifact.size, sha512: artifact.sha512,
        channelMetadata: artifact.channelMetadata })
      const body = streamedBody(artifact)
      try {
        const response = await cos.putObject({ Bucket: plan.bucket, Region: DESKTOP_COS_REGION, Key: key,
          Body: body, ContentLength: artifact.size, ContentType: artifact.contentType,
          Headers: { 'Content-MD5': artifact.md5, ...desktopUploadObjectHeaders(artifact) } })
        confirmedPuts++
        stage = 'record-response'
        recordPackagingEvent(directory, { type: 'put-confirmed', key, attempts: 1, ...receipt(response) })
      } catch (error) {
        // An immutable key that already holds these exact bytes is this upload's own earlier write; a missing
        // response must not leave the release stuck on an object nobody may delete.
        if (!alreadyExists(error)) throw error
        stage = 'verify-existing'
        if (!await storedObjectMatches(cos, plan.bucket, artifact)) {
          throw new DesktopUploadConflict(`desktop upload: immutable object already holds different bytes at ${key}`)
        }
        recordPackagingEvent(directory, { type: 'put-skipped', key, reason: 'identical-object' })
        skipped = true
      } finally {
        body.destroy()
      }
      process.stdout.write(`desktop upload: ${skipped ? 'skipped(exists)' : 'uploaded'} ${key}\n`)
    }
    stage = 'complete'
    recordPackagingEvent(directory, { type: 'upload-complete', confirmedPuts })
    success = true
    return directory
  } catch (error) {
    failure = failureReceipt(error)
    throw new Error(`desktop upload: stopped at ${stage}; inspect ${directory} before another upload`)
  } finally {
    await writeFile(join(directory, 'result.json'), `${JSON.stringify({ schemaVersion: 1, startedAt,
      finishedAt: new Date().toISOString(), environment: plan.environment, target: plan.target, version: plan.version,
      success, stage, key, confirmedPuts, failure, publicReadback: 'not-performed' }, null, 2)}\n`,
    { flag: 'wx', mode: 0o600, flush: true })
  }
}
