/** Release family discovery, publish order, tag naming, and the bump judgements. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { officialClientBuildEnvironment, writeClientBuildRecord } from '../client-build-environment.ts'
import { ON_DEMAND_BUNDLES } from '../../packages/util/official-bundles/src/bundles.ts'
import { releaseFamily, type ReleaseMember } from './families.ts'
import { compareVersions, nextVendorVersion, planShared, reachesPayload } from './bump.ts'

/**
 * A release member standing in for a manifest on disk.
 * @param directory - repository-relative package directory.
 * @param name - package name.
 * @param manifest - manifest fields the subject reads.
 * @returns The member.
 */
function member(directory: string, name: string, manifest: Record<string, unknown> = {}): ReleaseMember {
  return { directory, name, version: '0.0.1', manifest }
}

const roots: string[] = []

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function buildFixture(environment: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mmp-release-build-'))
  roots.push(root)
  write(join(root, 'package.json'), `${JSON.stringify({ version: environment.MMP_CLIENT_VERSION ?? '0.0.1' })}\n`)
  write(join(root, 'apps/web/dist/index.html'), '<main></main>')
  write(join(root, 'packages/client/example/lib/client.js'), 'module.exports = {}\n')
  writeClientBuildRecord(root, environment)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('release families', () => {
  it('publishes all current experimental packages', () => {
    const members = releaseFamily('mmp').members(resolve(import.meta.dirname, '../..'))

    expect(members
      .filter(member => member.directory.startsWith('packages/experimental/'))
      .map(member => member.name)).toEqual([
      '@mammoth-ai/mmp-action-cards',
      '@mammoth-ai/mmp-experimental-agent-team-profile',
      '@mammoth-ai/mmp-experimental-agent-team',
      '@mammoth-ai/mmp-experimental-api-speech-to-text',
      '@mammoth-ai/mmp-experimental-auto-review',
      '@mammoth-ai/mmp-experimental-badge-skill-bundle',
      '@mammoth-ai/mmp-experimental-browser-use-chrome-devtools-mcp',
      '@mammoth-ai/mmp-experimental-browser-use-playwright-mcp',
      '@mammoth-ai/mmp-experimental-browser-use-runtime',
      '@mammoth-ai/mmp-experimental-browser-use-stagehand-native',
      '@mammoth-ai/mmp-experimental-claude-code-mods',
      '@mammoth-ai/mmp-client-ui-action-cards',
      '@mammoth-ai/mmp-experimental-client-ui-agent-team',
      '@mammoth-ai/mmp-experimental-client-ui-claude-code-mods',
      '@mammoth-ai/mmp-experimental-client-ui-cot-translation',
      '@mammoth-ai/mmp-client-ui-creation-recommendations',
      '@mammoth-ai/mmp-experimental-client-ui-forge',
      '@mammoth-ai/mmp-client-ui-plugin-recommendations',
      '@mammoth-ai/mmp-experimental-client-ui-stats',
      '@mammoth-ai/mmp-experimental-client-ui-voice-input',
      '@mammoth-ai/mmp-experimental-computer-use-cua-driver-mcp',
      '@mammoth-ai/mmp-experimental-computer-use-cua-driver-native',
      '@mammoth-ai/mmp-experimental-cot-translation-bundle',
      '@mammoth-ai/mmp-creation-recommendations',
      '@mammoth-ai/mmp-cua-bundle',
      '@mammoth-ai/mmp-experimental-cua-macos',
      '@mammoth-ai/mmp-cua',
      '@mammoth-ai/mmp-experimental-forge-bundle',
      '@mammoth-ai/mmp-experimental-forge-github',
      '@mammoth-ai/mmp-experimental-forge-session',
      '@mammoth-ai/mmp-experimental-forge',
      '@mammoth-ai/mmp-hook-protocol',
      '@mammoth-ai/mmp-hooks-claude-code',
      '@mammoth-ai/mmp-hooks-codex',
      '@mammoth-ai/mmp-experimental-inspector-profile',
      '@mammoth-ai/mmp-experimental-inspector',
      '@mammoth-ai/mmp-experimental-liveshare-protocol',
      '@mammoth-ai/mmp-experimental-liveshare',
      '@mammoth-ai/mmp-personalized-recommendations',
      '@mammoth-ai/mmp-experimental-plugin-market-bundle',
      '@mammoth-ai/mmp-plugin-recommendations',
      '@mammoth-ai/mmp-experimental-ptc-runtime-python',
      '@mammoth-ai/mmp-experimental-ralph-bundle',
      '@mammoth-ai/mmp-experimental-session-inspector',
      '@mammoth-ai/mmp-experimental-session-search',
      '@mammoth-ai/mmp-session-title-all-prompts-llm',
      '@mammoth-ai/mmp-experimental-session-titles-bundle',
      '@mammoth-ai/mmp-skill-badge',
      '@mammoth-ai/mmp-experimental-speech-to-text-sensevoice',
      '@mammoth-ai/mmp-experimental-speech-to-text',
      '@mammoth-ai/mmp-experimental-subagent-oar',
      '@mammoth-ai/mmp-experimental-terminal-bundle',
      '@mammoth-ai/mmp-experimental-tool-agent-team',
      '@mammoth-ai/mmp-tool-ralph',
      '@mammoth-ai/mmp-tool-session-query',
      '@mammoth-ai/mmp-experimental-tool-subagent-oar',
      '@mammoth-ai/mmp-tool-terminal',
      '@mammoth-ai/mmp-experimental-tool-worktree',
      '@mammoth-ai/mmp-experimental-translator',
      '@mammoth-ai/mmp-experimental-voice-input-bundle',
      '@mammoth-ai/mmp-webhook-github',
      '@mammoth-ai/mmp-webhook',
      '@mammoth-ai/mmp-experimental-webworker-packer',
      '@mammoth-ai/mmp-experimental-webworker-runtime',
      '@mammoth-ai/mmp-experimental-worktree',
    ])
  })

  it('excludes private applications from the publish set', () => {
    const root = mkdtempSync(join(tmpdir(), 'mmp-release-private-'))
    roots.push(root)
    write(join(root, 'apps/public/package.json'), '{"name":"@mammoth-ai/mmp-public","version":"0.0.1"}\n')
    write(join(root, 'apps/private/package.json'), '{"name":"@mammoth-ai/mmp-private","version":"0.0.1","private":true}\n')

    expect(releaseFamily('mmp').members(root).map(entry => entry.name)).toEqual(['@mammoth-ai/mmp-public'])
  })

  it('publishes unlisted experimental packages while retaining private exclusions', () => {
    const root = mkdtempSync(join(tmpdir(), 'mmp-release-experimental-'))
    roots.push(root)
    write(join(root, 'packages/experimental/prototype/package.json'), JSON.stringify({
      name: '@mammoth-ai/mmp-experimental-prototype',
      version: '0.0.1',
      publishConfig: { access: 'public' },
    }))
    write(join(root, 'packages/experimental/inspector/package.json'), JSON.stringify({
      name: '@mammoth-ai/mmp-experimental-inspector',
      version: '0.0.1',
      private: true,
    }))

    expect(releaseFamily('mmp').members(root).map(entry => entry.name)).toEqual([
      '@mammoth-ai/mmp-experimental-prototype',
    ])
  })

  it('bumps private mmp workspaces without adding release tags', () => {
    const root = mkdtempSync(join(tmpdir(), 'mmp-release-version-'))
    roots.push(root)
    write(join(root, 'package.json'), '{"version":"0.0.1"}\n')
    write(join(root, 'apps/desktop/package.json'), '{"version":"0.0.1","private":true}\n')
    write(join(root, 'packages/experimental/prototype/package.json'), '{"version":"0.0.1","private":true}\n')
    write(join(root, 'packages/core/unselected/package.json'), '{"version":"0.0.1"}\n')

    const mmp = releaseFamily('mmp')
    const published = member('packages/core/published', '@mammoth-ai/mmp-published')
    const { planned } = planShared(mmp, root, [published], '0.0.2')

    expect(planned.map(entry => ({ path: entry.manifestPath, tag: entry.tag }))).toEqual([
      { path: 'package.json', tag: undefined },
      { path: 'packages/core/published/package.json', tag: 'mmp-v0.0.2' },
      { path: 'apps/desktop/package.json', tag: undefined },
      { path: 'packages/experimental/prototype/package.json', tag: undefined },
    ])
  })

  it.each(['0.0.2-alpha.1', '0.0.2-canary.1', '0.0.2-rc.1'])(
    'accepts the explicit mmp prerelease version %s',
    (version) => {
      const root = mkdtempSync(join(tmpdir(), 'mmp-release-prerelease-'))
      roots.push(root)
      write(join(root, 'package.json'), '{"version":"0.0.1"}\n')

      const mmp = releaseFamily('mmp')
      const published = member('packages/core/published', '@mammoth-ai/mmp-published')
      const plan = planShared(mmp, root, [published], version)

      expect(plan.version).toBe(version)
      expect(plan.planned[1]?.tag).toBe(`mmp-v${version}`)
    },
  )

  it('names one tag for the whole mmp family and one per vendored package', () => {
    const mmp = releaseFamily('mmp')
    const vendor = releaseFamily('vendor')
    const cli = member('apps/cli', '@mammoth-ai/mmp')
    const cordis = { ...member('vendor/cordis', '@mammoth-ai/cordis'), version: '4.0.1' }

    expect(mmp.tagFor(cli)).toBe('mmp-v0.0.1')
    expect(vendor.tagFor(cordis)).toBe('vendor-cordis-v4.0.1')
    // The prefix is constructed, not recovered from a tag: a version with a
    // hyphen would defeat any suffix-stripping.
    expect(vendor.tagPrefixFor({ ...cordis, version: '4.0.0-rc.7' })).toBe('vendor-cordis-v')
    expect(vendor.tagFor({ ...cordis, version: '4.0.0-rc.7' })).toBe('vendor-cordis-v4.0.0-rc.7')
  })

  it('assigns alpha and canary dist-tags only to mmp releases', () => {
    const mmp = releaseFamily('mmp')
    const vendor = releaseFamily('vendor')

    expect(mmp.distTagForVersion('0.0.2-alpha.1')).toBe('alpha')
    expect(mmp.distTagForVersion('0.0.2-canary.1')).toBe('canary')
    expect(mmp.distTagForVersion('0.0.2-rc.1')).toBe('next')
    expect(mmp.distTagForVersion('0.0.2')).toBeUndefined()
    expect(vendor.distTagForVersion('4.0.1-alpha.1')).toBe('next')
    expect(vendor.distTagForVersion('4.0.1-canary.1')).toBe('next')
  })

  it('rejects a family whose members disagree on the shared version', () => {
    const mmp = releaseFamily('mmp')
    const members = [member('apps/cli', '@mammoth-ai/mmp'), { ...member('apps/web', '@mammoth-ai/mmp-web-frontend'), version: '0.0.2' }]

    expect(() => { mmp.verifyVersions(members) }).toThrow(/must share one version/)
    expect(() => { mmp.verifyVersions([members[0]!]) }).not.toThrow()
  })

  it('accepts independent vendored versions and rejects an unpublishable one', () => {
    const vendor = releaseFamily('vendor')
    const members = [
      { ...member('vendor/cordis', '@mammoth-ai/cordis'), version: '4.0.1' },
      { ...member('vendor/cosmokit', '@mammoth-ai/cosmokit'), version: '1.8.2' },
    ]

    expect(() => { vendor.verifyVersions(members) }).not.toThrow()
    expect(() => { vendor.verifyVersions([{ ...members[0]!, version: 'latest' }]) }).toThrow(/unpublishable version/)
  })

  it('requires a current official client build only for mmp artifacts', () => {
    const mmp = releaseFamily('mmp')
    const vendor = releaseFamily('vendor')
    const officialEnvironment = officialClientBuildEnvironment(resolve(import.meta.dirname, '../..'))
    vi.stubEnv('MMP_CLIENT_COMMIT_HASH', officialEnvironment.MMP_CLIENT_COMMIT_HASH)
    const official = buildFixture(officialEnvironment)
    const defaultBuild = buildFixture({})
    const missing = join(defaultBuild, 'missing')
    write(join(missing, 'package.json'), `${JSON.stringify({ version: officialEnvironment.MMP_CLIENT_VERSION })}\n`)

    expect(() => { mmp.verifyBuildArtifacts(official) }).not.toThrow()
    expect(() => { mmp.verifyBuildArtifacts(defaultBuild) }).toThrow(/MMP_CLIENT_TITLE/)
    expect(() => { mmp.verifyBuildArtifacts(missing) }).toThrow(/record.*missing/)
    expect(() => { vendor.verifyBuildArtifacts(missing) }).not.toThrow()

    write(join(official, 'packages/client/example/lib/client.js'), 'module.exports = { changed: true }\n')
    expect(() => { mmp.verifyBuildArtifacts(official) }).toThrow(/artifacts differ/)
  })

  it('publishes a dependency before its consumer, and orders ties by name', () => {
    const mmp = releaseFamily('mmp')
    const members = [
      member('packages/a/consumer', '@mammoth-ai/mmp-consumer', { dependencies: { '@mammoth-ai/mmp-library': 'workspace:^' } }),
      member('packages/a/library', '@mammoth-ai/mmp-library'),
      member('packages/a/zebra', '@mammoth-ai/mmp-zebra'),
    ]

    expect(mmp.publishOrder(members).order.map(entry => entry.name)).toEqual([
      '@mammoth-ai/mmp-library',
      '@mammoth-ai/mmp-consumer',
      '@mammoth-ai/mmp-zebra',
    ])
  })

  it('publishes on-demand catalog members before mmp without adding installed dependencies', () => {
    const mmp = member('apps/cli', '@mammoth-ai/mmp')
    const providers = ON_DEMAND_BUNDLES.map(name => member(`packages/subagent/${name}`, name))
    const plan = releaseFamily('mmp').publishOrder([mmp, ...providers])
    expect(plan.order.map(entry => entry.name)).toEqual([...ON_DEMAND_BUNDLES.toSorted(), mmp.name])
    expect(mmp.manifest).toEqual({})
    expect(plan.droppedPeerEdges).toEqual([])
  })

  it('rejects an advertised provider missing from the public release family', () => {
    expect(() => releaseFamily('mmp').publishOrder([member('apps/cli', '@mammoth-ai/mmp')]))
      .toThrow('Official catalog prerequisite')
  })

  it('keeps catalog prerequisites ahead of a mmp peer declaration', () => {
    const mmp = member('apps/cli', '@mammoth-ai/mmp')
    const providers = ON_DEMAND_BUNDLES.map(name => member(`packages/subagent/${name}`, name, {
      peerDependencies: { '@mammoth-ai/mmp': 'workspace:*' },
    }))
    const plan = releaseFamily('mmp').publishOrder([mmp, ...providers])
    expect(plan.order.map(entry => entry.name)).toEqual([...ON_DEMAND_BUNDLES.toSorted(), mmp.name])
    expect(plan.droppedPeerEdges).toEqual(ON_DEMAND_BUNDLES.toSorted().map(name => ({ consumer: name, peer: mmp.name })))
  })

  it.each(['dependencies', 'optionalDependencies', 'peerDependencies'])(
    'requires exact packed MMP %s while preserving external ranges', (section) => {
      const pkg = member('packages/example/provider', '@mammoth-ai/mmp-provider')
      const family = releaseFamily('mmp')
      const manifest = { name: pkg.name, version: pkg.version, [section]: { '@mammoth-ai/mmp-tools': pkg.version, external: '^4.0.0' } }
      expect(() => { family.validatePackedManifest(pkg, manifest) }).not.toThrow()
      for (const range of ['workspace:*', '^0.0.1', '~0.0.1', '0.0.2', '*']) {
        expect(() => { family.validatePackedManifest(pkg, { ...manifest, [section]: { '@mammoth-ai/mmp-tools': range } }) })
          .toThrow(`packed ${section}.@mammoth-ai/mmp-tools must equal`)
      }
    },
  )

  it('checks packed identities and preserves independent vendor versions', () => {
    const pkg = member('vendor/example', '@mammoth-ai/example')
    const family = releaseFamily('vendor')
    expect(() => { family.validatePackedManifest(pkg, { name: pkg.name, version: pkg.version, dependencies: { '@mammoth-ai/mmp-tools': '^4.0.0' } }) })
      .not.toThrow()
    expect(() => { family.validatePackedManifest(pkg, { name: '@mammoth-ai/other', version: pkg.version }) }).toThrow('packed identity')
    expect(() => { family.validatePackedManifest(pkg, { name: pkg.name, version: '0.0.2' }) }).toThrow('packed identity')
  })

  it('reports a runtime dependency cycle instead of emitting an arbitrary order', () => {
    const mmp = releaseFamily('mmp')
    const members = [
      member('packages/a/left', '@mammoth-ai/mmp-left', { dependencies: { '@mammoth-ai/mmp-right': 'workspace:^' } }),
      member('packages/a/right', '@mammoth-ai/mmp-right', { dependencies: { '@mammoth-ai/mmp-left': 'workspace:^' } }),
    ]

    expect(() => { mmp.publishOrder(members) }).toThrow(/dependency cycle/)
  })

  it('publishes a peer before its consumer', () => {
    const mmp = releaseFamily('mmp')
    const members = [
      member('packages/a/consumer', '@mammoth-ai/mmp-consumer', { peerDependencies: { '@mammoth-ai/mmp-zebra': 'workspace:^' } }),
      member('packages/a/zebra', '@mammoth-ai/mmp-zebra'),
    ]

    // Name order alone would place the consumer first; the peer edge moves it.
    expect(mmp.publishOrder(members).order.map(entry => entry.name)).toEqual([
      '@mammoth-ai/mmp-zebra',
      '@mammoth-ai/mmp-consumer',
    ])
  })

  it('orders around a peer cycle rather than refusing to publish, and reports the edge it dropped', () => {
    const mmp = releaseFamily('mmp')
    const members = [
      member('packages/a/left', '@mammoth-ai/mmp-left', { peerDependencies: { '@mammoth-ai/mmp-right': 'workspace:^' } }),
      member('packages/a/right', '@mammoth-ai/mmp-right', { peerDependencies: { '@mammoth-ai/mmp-left': 'workspace:^' } }),
    ]

    // Sibling packages declare each other as peers, and npm treats an unmet peer
    // as a warning, so this pair has to publish rather than fail the release.
    const plan = mmp.publishOrder(members)
    expect(plan.order.map(entry => entry.name)).toEqual([
      '@mammoth-ai/mmp-right',
      '@mammoth-ai/mmp-left',
    ])
    // One of the two edges has to give, and which one it is belongs in the log.
    expect(plan.droppedPeerEdges).toEqual([
      { consumer: '@mammoth-ai/mmp-right', peer: '@mammoth-ai/mmp-left' },
    ])
  })

  it('honours an install edge even when a peer cycle surrounds it', () => {
    const mmp = releaseFamily('mmp')
    const members = [
      member('packages/a/base', '@mammoth-ai/mmp-base', { peerDependencies: { '@mammoth-ai/mmp-consumer': 'workspace:^' } }),
      member('packages/a/consumer', '@mammoth-ai/mmp-consumer', {
        dependencies: { '@mammoth-ai/mmp-base': 'workspace:^' },
        peerDependencies: { '@mammoth-ai/mmp-base': 'workspace:^' },
      }),
    ]

    // The install edge is absolute: base publishes first, and the peer edge that
    // would reverse it is the one dropped.
    const plan = mmp.publishOrder(members)
    expect(plan.order.map(entry => entry.name)).toEqual([
      '@mammoth-ai/mmp-base',
      '@mammoth-ai/mmp-consumer',
    ])
    expect(plan.droppedPeerEdges).toEqual([
      { consumer: '@mammoth-ai/mmp-base', peer: '@mammoth-ai/mmp-consumer' },
    ])
  })

  it('refuses an order that would publish a consumer before a dependency it installs', () => {
    const mmp = releaseFamily('mmp')
    const members = [
      member('packages/a/alpha', '@mammoth-ai/mmp-alpha', { peerDependencies: { '@mammoth-ai/mmp-bravo': 'workspace:^' } }),
      member('packages/a/bravo', '@mammoth-ai/mmp-bravo', { peerDependencies: { '@mammoth-ai/mmp-charlie': 'workspace:^' } }),
      member('packages/a/charlie', '@mammoth-ai/mmp-charlie', { dependencies: { '@mammoth-ai/mmp-alpha': 'workspace:^' } }),
    ]

    // A cycle of two peer edges closed by one install edge: dropping a peer edge
    // would order this, and the traversal drops the install edge instead. That
    // order would publish charlie before the alpha it installs, so it is refused
    // here rather than published.
    expect(() => { mmp.publishOrder(members) }).toThrow(/no publish order honours @deepseek-ai\/mmp-charlie -> @deepseek-ai\/mmp-alpha/)
  })

  it('ignores devDependencies when ordering', () => {
    const mmp = releaseFamily('mmp')
    const members = [
      member('packages/a/alpha', '@mammoth-ai/mmp-alpha', { devDependencies: { '@mammoth-ai/mmp-zebra': 'workspace:^' } }),
      member('packages/a/zebra', '@mammoth-ai/mmp-zebra'),
    ]

    // A dev dependency is absent from the published package, so it must not move
    // the consumer behind it.
    expect(mmp.publishOrder(members).order.map(entry => entry.name)).toEqual([
      '@mammoth-ai/mmp-alpha',
      '@mammoth-ai/mmp-zebra',
    ])
  })

  it('applies the harness payload policy to mmp and keeps upstream payloads for vendored packages', () => {
    const mmp = releaseFamily('mmp')
    const vendor = releaseFamily('vendor')
    const harness = member('packages/a/library', '@mammoth-ai/mmp-library')
    const vendored = member('vendor/cordis', '@mammoth-ai/cordis')

    expect(() => { mmp.validatePayload(harness, ['package/lib/index.js', 'package/src/index.ts']) })
      .toThrow(/publishes source file/)
    expect(() => { vendor.validatePayload(vendored, ['package/lib/index.js', 'package/src/index.ts']) }).not.toThrow()
    expect(() => { vendor.validatePayload(vendored, []) }).toThrow(/empty tarball/)
  })

  it('drives the installed entry only for the family that publishes one', () => {
    expect(releaseFamily('mmp').installedEntry).toEqual({ packageName: '@mammoth-ai/mmp', binPath: 'lib/bin.js' })
    expect(releaseFamily('vendor').installedEntry).toBeUndefined()
  })

  it('rejects an unknown family identifier', () => {
    expect(() => { releaseFamily('native') }).toThrow(/unknown release family/)
  })
})

describe('vendored version baseline', () => {
  it('drops an upstream prerelease segment and increments the patch', () => {
    expect(nextVendorVersion('4.0.0-rc.7', undefined)).toBe('4.0.1')
    expect(nextVendorVersion('1.0.0-rc.5', undefined)).toBe('1.0.1')
    expect(nextVendorVersion('1.8.1', undefined)).toBe('1.8.2')
  })

  it('increments from the last published version when a re-sync restored a lower one', () => {
    // Upstream moved rc.7 -> rc.8 after this repository published 4.0.1;
    // incrementing the manifest alone would name 4.0.1 a second time.
    expect(nextVendorVersion('4.0.0-rc.8', '4.0.1')).toBe('4.0.2')
    expect(nextVendorVersion('4.1.0', '4.0.1')).toBe('4.1.1')
  })

  it('appends a rehearsal prerelease without consuming its release numbers', () => {
    // A rehearsal burns 4.0.1-rc.1 and leaves 4.0.1 free, so the stable release
    // that follows takes those same numbers instead of skipping to 4.0.2.
    expect(nextVendorVersion('4.0.0-rc.7', undefined, 'rc.1')).toBe('4.0.1-rc.1')
    expect(nextVendorVersion('4.0.0-rc.7', '4.0.1-rc.1', 'rc.2')).toBe('4.0.1-rc.2')
    expect(nextVendorVersion('4.0.0-rc.7', '4.0.1-rc.1')).toBe('4.0.1')
    expect(nextVendorVersion('4.0.0-rc.7', '4.0.1')).toBe('4.0.2')
  })
})

describe('version precedence', () => {
  it('orders alpha, canary, and release-candidate versions by semver precedence', () => {
    expect(compareVersions('4.0.1-alpha.1', '4.0.1-canary.1')).toBeLessThan(0)
    expect(compareVersions('4.0.1-canary.1', '4.0.1-rc.1')).toBeLessThan(0)
    expect(compareVersions('4.0.1-rc.1', '4.0.1')).toBeLessThan(0)
  })

  it('ranks a release above the prerelease it follows', () => {
    // git --sort=v:refname disagrees, placing 4.0.1-rc.1 above 4.0.1, which is
    // why the newest published version is chosen here rather than by git.
    expect(compareVersions('4.0.1', '4.0.1-rc.1')).toBeGreaterThan(0)
    expect(compareVersions('4.0.1-rc.1', '4.0.1')).toBeLessThan(0)
  })

  it('compares numeric prerelease fields numerically', () => {
    expect(compareVersions('4.0.1-rc.10', '4.0.1-rc.1')).toBeGreaterThan(0)
    expect(compareVersions('4.0.1-rc.2', '4.0.1-rc.10')).toBeLessThan(0)
  })

  it('ranks a numeric field below an alphanumeric one, and a shorter list below a longer', () => {
    expect(compareVersions('4.0.1-1', '4.0.1-alpha')).toBeLessThan(0)
    expect(compareVersions('4.0.1-rc', '4.0.1-rc.1')).toBeLessThan(0)
    expect(compareVersions('4.0.2', '4.0.1')).toBeGreaterThan(0)
    expect(compareVersions('4.0.1-rc.1', '4.0.1-rc.1')).toBe(0)
  })
})

describe('payload change judgement', () => {
  const sourceShipping = member('vendor/cosmokit', '@mammoth-ai/cosmokit', {
    files: ['lib/index.js', 'lib/types/**/*.d.ts', 'src'],
  })
  const buildOutputOnly = member('vendor/cordis', '@mammoth-ai/cordis', {
    files: ['lib/index.js', 'lib/types/**/*.d.ts', 'bin.js'],
  })

  it('counts the manifest and the files npm always publishes', () => {
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/package.json')).toBe(true)
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/README.md')).toBe(true)
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/src/index.ts')).toBe(true)
  })

  it('counts build inputs for a package whose payload is build output', () => {
    // cordis publishes lib/ only, and lib/ is not tracked: without this, a real
    // source change reads as "nothing changed" and the next publish fails on a
    // version whose bytes moved.
    expect(reachesPayload(buildOutputOnly, 'vendor/cordis/src/context.ts')).toBe(true)
    expect(reachesPayload(buildOutputOnly, 'vendor/cordis/tsconfig.json')).toBe(true)
  })

  it('ignores paths no tarball carries', () => {
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/tests/unit.spec.ts')).toBe(false)
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/CHANGELOG.md')).toBe(false)
    // The README pattern is deliberately loose: over-reporting a change costs one
    // unnecessary patch bump, while under-reporting fails the next publish on a
    // version whose bytes moved.
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/README.i18n.yaml')).toBe(true)
    expect(reachesPayload(member('packages/a/library', '@mammoth-ai/mmp-library', { files: ['lib/index.js'] }),
      'packages/a/library/tests/library.spec.ts')).toBe(false)
  })
})
