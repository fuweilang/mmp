/**
 * One product prefix and one artifact stem must reach every naming consumer: the electron-builder
 * output name, CI retention, macOS promotion, version discovery, and installed-update distribution.
 * A half-finished rename otherwise passes unit tests whose fixtures still carry the old name.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DESKTOP_ARTIFACT_STEM,
  desktopArtifactBase,
  desktopArtifactBaseForTarget,
} from '../scripts/desktop-artifact-name.mjs'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'

const SCRIPTS = join(import.meta.dirname, '../scripts')

/** Environment that builds configuration without signing, notarization, or an update destination. */
const environment = {
  MMP_DESKTOP_APP_ID: 'com.example.artifact-name',
  MMP_DESKTOP_UNSIGNED: '1',
  MMP_DESKTOP_TARGET_ARCH: 'x64',
  MMP_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
  MMP_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
}

/**
 * Expand electron-builder's version macros the way its artifact naming does.
 * @param template Packaged artifactName template.
 * @param version Packaged version.
 * @param os Electron target OS macro value.
 * @param arch Electron target architecture macro value.
 * @param ext Final artifact extension.
 * @returns The file name electron-builder writes.
 */
function render(template: string, version: string, os: string, arch: string, ext: string): string {
  return template.replaceAll('${version}', version).replaceAll('${os}', os)
    .replaceAll('${arch}', arch).replaceAll('${ext}', ext)
}

describe('desktop artifact naming', () => {
  it('keeps one literal product stem for every consumer', () => {
    expect(DESKTOP_ARTIFACT_STEM).toBe('mammoth-ai')
    expect(desktopArtifactBase('1.2.3', 'mac', 'arm64')).toBe('mammoth-ai-1.2.3-mac-arm64')
    expect(desktopArtifactBaseForTarget('1.2.3', 'win-x64')).toBe('mammoth-ai-1.2.3-win-x64')
    expect(desktopArtifactBaseForTarget('1.2.3', 'mac-x64')).toBe('mammoth-ai-1.2.3-mac-x64')
  })

  it.each([
    ['win32', 'x64', 'win-x64', 'win', 'x64', 'exe'],
    ['darwin', 'arm64', 'mac-arm64', 'mac', 'arm64', 'zip'],
    ['darwin', 'x64', 'mac-x64', 'mac', 'x64', 'dmg'],
  ] as const)('matches the electron-builder output name for %s/%s', (platform, arch, target, os, macroArch, ext) => {
    const config = createElectronBuilderConfig({
      ...environment, MMP_DESKTOP_TARGET_PLATFORM: platform, MMP_DESKTOP_TARGET_ARCH: arch,
    }, platform, arch)
    // Debug builds append their own qualification suffix; the stem before it is the shared release name.
    const rendered = render(String(config.artifactName), '1.2.3', os, macroArch, ext)
      .replace(/-(?:unsigned|unnotarized)(?=\.)/u, '')
    expect(rendered).toBe(`${desktopArtifactBaseForTarget('1.2.3', target)}.${ext}`)
  })

  it('builds retention, promotion, and distribution names from the same stem', async () => {
    // Retention, macOS promotion, and installed-update distribution must not spell the product itself.
    for (const script of ['retain-desktop-ci.ts', 'package-macos.ts', 'installed-update-distribution.ts']) {
      expect(await readFile(join(SCRIPTS, script), 'utf8')).not.toContain('deepseek-harness')
    }
    // The pre-rename stem survives only where published objects or packages are read back.
    for (const script of ['desktop-build-version-discovery.ts', 'desktop-upload-plan.ts']) {
      expect(await readFile(join(SCRIPTS, script), 'utf8')).toMatch(/DESKTOP_ARTIFACT_STEM|desktopArtifactBase/u)
    }
  })
})
