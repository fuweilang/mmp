import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AGENTS_HOME_DIR_NAME,
  DEFAULT_AGENTS_HOME_DISPLAY,
  DEFAULT_MMP_HOME_DISPLAY,
  MMP_HOME_DIR_NAME,
  agentsHomeDisplay,
  canonicalizeWatchPath,
  defaultAgentsHome,
  defaultMmpHome,
  mmpCachePath,
  mmpHomeDisplay,
  mmpHomePath,
  expandHomePath,
  resolveAgentsHome,
  resolveMmpHome,
} from '@mammoth-ai/mmp-home-paths'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('mmp path helpers', () => {
  it('owns the shared default MMP home directory name', () => {
    expect(MMP_HOME_DIR_NAME).toBe('.mmp')
    expect(DEFAULT_MMP_HOME_DISPLAY).toBe('~/.mmp')
    expect(defaultMmpHome()).toBe(join(homedir(), '.mmp'))
  })

  it('expands tilde paths without changing non-tilde paths', () => {
    expect(expandHomePath('~')).toBe(homedir())
    expect(expandHomePath('~/.mmp')).toBe(join(homedir(), '.mmp'))
    expect(expandHomePath('~\\.mmp')).toBe(join(homedir(), '.mmp'))
    expect(expandHomePath('/tmp/.mmp')).toBe('/tmp/.mmp')
    expect(expandHomePath('~other/.mmp')).toBe('~other/.mmp')
  })

  it('resolves explicit path before MMP_HOME and the default', () => {
    const envHome = join(homedir(), 'env-mmp')

    expect(resolveMmpHome('/tmp/explicit-mmp', { MMP_HOME: '~/env-mmp' })).toBe(resolve('/tmp/explicit-mmp'))
    expect(resolveMmpHome(undefined, { MMP_HOME: '~/env-mmp' })).toBe(envHome)
    expect(resolveMmpHome(undefined, {})).toBe(defaultMmpHome())
  })

  it('treats an empty or whitespace-only MMP_HOME as unset', () => {
    expect(resolveMmpHome(undefined, { MMP_HOME: '' })).toBe(defaultMmpHome())
    expect(resolveMmpHome(undefined, { MMP_HOME: '   ' })).toBe(defaultMmpHome())
  })

  it('joins child segments onto the resolved MMP_HOME', () => {
    vi.stubEnv('MMP_HOME', '~/env-mmp')
    expect(mmpHomePath()).toBe(join(homedir(), 'env-mmp'))
    expect(mmpHomePath('storages', 'cache')).toBe(join(homedir(), 'env-mmp', 'storages', 'cache'))
  })

  it('labels a resolved home by whether it is the default root', () => {
    expect(mmpHomeDisplay(resolve(defaultMmpHome()))).toBe('~/.mmp')
    expect(mmpHomeDisplay('/some/other/root')).toBe('$MMP_HOME')
  })

  it('owns the shared default agents home directory name', () => {
    expect(AGENTS_HOME_DIR_NAME).toBe('.agents')
    expect(DEFAULT_AGENTS_HOME_DISPLAY).toBe('~/.agents')
    expect(defaultAgentsHome()).toBe(join(homedir(), '.agents'))
  })

  it('resolves an explicit agents home before MMP_AGENTS_HOME and the default', () => {
    const envHome = join(homedir(), 'env-agents')

    expect(resolveAgentsHome('/tmp/explicit-agents', { MMP_AGENTS_HOME: '~/env-agents' })).toBe(resolve('/tmp/explicit-agents'))
    expect(resolveAgentsHome(undefined, { MMP_AGENTS_HOME: '~/env-agents' })).toBe(envHome)
    expect(resolveAgentsHome(undefined, {})).toBe(defaultAgentsHome())
  })

  it('treats an empty or whitespace-only MMP_AGENTS_HOME as unset', () => {
    expect(resolveAgentsHome(undefined, { MMP_AGENTS_HOME: '' })).toBe(defaultAgentsHome())
    expect(resolveAgentsHome(undefined, { MMP_AGENTS_HOME: '   ' })).toBe(defaultAgentsHome())
  })

  it('labels a resolved agents home by whether it is the default root', () => {
    expect(agentsHomeDisplay(resolve(defaultAgentsHome()))).toBe('~/.agents')
    expect(agentsHomeDisplay('/some/other/root')).toBe('$MMP_AGENTS_HOME')
  })

  it.each([
    [undefined, join(homedir(), '.mmp')],
    ['', join(homedir(), '.mmp')],
    ['   ', join(homedir(), '.mmp')],
    ['~/env-mmp', join(homedir(), 'env-mmp')],
    ['./relative-mmp', resolve('./relative-mmp')],
  ] as const)('resolves cache paths with MMP_HOME=%j', (home, expectedHome) => {
    vi.stubEnv('MMP_HOME', home)
    try {
      expect(mmpCachePath()).toBe(join(expectedHome, 'cache'))
      expect(mmpCachePath('models', 'index.json')).toBe(join(expectedHome, 'cache', 'models', 'index.json'))
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('resolves configured cache homes before the environment', () => {
    vi.stubEnv('MMP_HOME', '~/env-mmp')
    try {
      expect(mmpCachePath({ mmpHome: '~/explicit-mmp' })).toBe(join(homedir(), 'explicit-mmp', 'cache'))
      expect(mmpCachePath({ mmpHome: './explicit-mmp' }, 'attachments', 'request-images'))
        .toBe(resolve('./explicit-mmp/cache/attachments/request-images'))
      expect(mmpCachePath({}, 'attachments')).toBe(join(homedir(), 'env-mmp', 'cache', 'attachments'))
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('canonicalizes a watcher ancestor while preserving a missing suffix', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mmp-watch-path-'))
    const target = join(root, 'target')
    const alias = join(root, 'alias')
    try {
      await mkdir(target)
      await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(canonicalizeWatchPath(alias)).resolves.toBe(await realpath(target))
      await expect(canonicalizeWatchPath(join(alias, 'later', 'config.yml'))).resolves.toBe(
        join(await realpath(target), 'later', 'config.yml'),
      )
      const file = join(root, 'file')
      await writeFile(file, 'not a directory')
      await expect(canonicalizeWatchPath(join(file, 'child'))).rejects.toMatchObject({ code: 'ENOTDIR' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
