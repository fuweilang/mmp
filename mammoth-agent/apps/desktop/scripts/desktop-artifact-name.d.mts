/** Single current product prefix shared with electron-builder. */
export const DESKTOP_ARTIFACT_STEM: string
/** Versioned product artifact stem, shared with electron-builder. */
export function desktopArtifactBase(version: string, os: string, arch: string): string
/** Versioned artifact stem for one fixed release target name (`mac-arm64`, `mac-x64`, `win-x64`). */
export function desktopArtifactBaseForTarget(version: string, target: string): string
