/** Filesystem ownership for the Electron-managed desktop installation. */

import { join } from 'node:path'
import { resolveMmpHome } from '@mammoth-ai/mmp-home-paths'

/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param mmpHome - Harness home shared with npm-installed mmp.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(mmpHome: string = resolveMmpHome()): DesktopPaths {
  return {
    profile: join(mmpHome, 'profiles', 'desktop'),
    lock: join(mmpHome, 'profiles', 'desktop', 'lock'),
  }
}
