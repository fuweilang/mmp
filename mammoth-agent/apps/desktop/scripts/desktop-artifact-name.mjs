/** Single current product prefix shared by builder, retention, discovery, publication, and upload planning. */
export const DESKTOP_ARTIFACT_STEM = 'mammoth-ai'

/**
 * @param {string} version Actual packaged version, or electron-builder's version template.
 * @param {string} os Builder target OS (mac or win).
 * @param {string} arch Target architecture.
 * @returns {string} Versioned artifact stem, never a mutable latest alias.
 */
export function desktopArtifactBase(version, os, arch) {
  return `${DESKTOP_ARTIFACT_STEM}-${version}-${os}-${arch}`
}

/**
 * @param {string} version Actual packaged version.
 * @param {string} target Fixed release target name, such as `mac-arm64` or `win-x64`.
 * @returns {string} Versioned artifact stem for that target.
 */
export function desktopArtifactBaseForTarget(version, target) {
  const [os, arch] = target.split('-')
  if (os === undefined || arch === undefined || target.split('-').length !== 2) {
    throw new Error(`desktop artifact: unsupported target ${JSON.stringify(target)}`)
  }
  return desktopArtifactBase(version, os, arch)
}
