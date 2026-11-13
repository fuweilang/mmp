/**
 * Compression and layout validation for one JSONL root: the suffix the backend
 * refuses to mix, and the failures that name a foreign or legacy artifact.
 * @module @mammoth-ai/mmp-session-persistence-jsonl/encoding
 */

import { readdirSync } from 'node:fs'
import { logSuffix, type JsonlCompression } from './format.ts'
import { isENOENT } from './fs-helpers.ts'

/**
 * Name the suffix this root must not contain.
 * @param compression - the backend's configured compression.
 * @returns the compression whose artifacts are refused in this root.
 */
export function oppositeCompression(compression: JsonlCompression): JsonlCompression {
  return compression === 'zstd' ? 'none' : 'zstd'
}

/**
 * Explain a foreign-compression artifact with the two ways to resolve it.
 * @param compression - the backend's configured compression.
 * @param path - the foreign artifact found in the root.
 * @returns the failure telling the operator to separate roots or match the mode.
 */
export function encodingMismatch(compression: JsonlCompression, path: string): Error {
  return new Error(
    `session artifact ${JSON.stringify(path)} uses ${logSuffix(oppositeCompression(compression))}, `
    + `but this backend is configured for compression ${JSON.stringify(compression)}; `
    + 'use a separate root or select the matching compression mode',
  )
}

/**
 * Refuse the pre-directory flat-file session layout.
 * @param path - the flat-file artifact found in the root.
 * @returns the failure naming the unsupported layout.
 */
export function legacyLayout(path: string): Error {
  return new Error(
    `session artifact ${JSON.stringify(path)} uses the unsupported flat-file layout; `
    + 'use a separate root or move it into a project/session directory before loading',
  )
}

/**
 * Require an existing configured root to be a readable directory.
 * @param root - the configured persistence root; absence is not a failure until a write.
 */
export function assertUsableRoot(root: string): void {
  try {
    readdirSync(root)
  } catch (error) {
    if (isENOENT(error)) return
    throw error
  }
}
