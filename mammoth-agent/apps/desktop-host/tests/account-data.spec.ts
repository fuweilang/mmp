import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { prepareDesktopDataHome } from '../src/account-data.ts'

it('pins task data and default files to account homes, preserving legacy history and shared login', async () => {
  const home = await mkdtemp(join(tmpdir(), 'mmp-account-homes-'))
  try {
    await mkdir(join(home, 'sessions'))
    await writeFile(join(home, 'sessions', 'legacy.jsonl'), 'unowned-history')
    await writeFile(join(home, '.credentials.yaml'), 'existing-login')
    const alice = join(home, 'desktop-accounts', 'alice'), bob = join(home, 'desktop-accounts', 'bob')
    const a = JSON.parse(await readFile(prepareDesktopDataHome(home, alice), 'utf8'))
    const b = JSON.parse(await readFile(prepareDesktopDataHome(home, bob), 'utf8'))
    expect(a).toEqual([
      { id: 'credentials', config: { path: join(home, '.credentials.yaml') } },
      { id: 'session-persistence-jsonl', config: { root: join(alice, 'sessions') } },
      { id: 'storage-json', config: { root: join(alice, 'storages') } },
      { id: 'attachment-local', config: { mmpHome: alice } },
      { id: 'session-query-sqlite', config: { path: ':memory:', openAt: 'never' } },
      { id: 'workspace-controller', config: { documentsDirectory: join(alice, 'Documents') } },
    ])
    expect(b[1].config.root).toBe(join(bob, 'sessions'))
    expect(b[2].config.root).toBe(join(bob, 'storages'))
    await mkdir(join(alice, 'sessions'))
    await writeFile(join(alice, 'sessions', 'a.jsonl'), 'alice-history')
    await expect(readFile(join(bob, 'sessions', 'a.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' })
    prepareDesktopDataHome(home, alice)
    expect(await readFile(join(alice, 'sessions', 'a.jsonl'), 'utf8')).toBe('alice-history')
    expect(await readFile(join(home, 'sessions', 'legacy.jsonl'), 'utf8')).toBe('unowned-history')
    expect(await readFile(join(home, '.credentials.yaml'), 'utf8')).toBe('existing-login')
  } finally { await rm(home, { recursive: true, force: true }) }
})
