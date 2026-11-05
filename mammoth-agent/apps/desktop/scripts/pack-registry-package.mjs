/** Fetch one published package tarball into a directory through `npm pack`. */

import { spawn } from 'node:child_process'

/**
 * Download `spec` from the registry as a tarball.
 * @param {string} spec - Package name with an exact version.
 * @param {string} destination - Directory receiving the tarball.
 * @param {string} registry - npm registry URL.
 * @returns {Promise<void>} Resolves when the tarball lands in the destination.
 */
export function packRegistryPackage(spec, destination, registry) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('npm', ['pack', spec, `--registry=${registry}`, '--pack-destination', destination], { stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`desktop package: npm pack ${spec} exited with ${String(code ?? signal)}`))
    })
  })
}
