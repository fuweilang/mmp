/** Final launcher overlay that pins every account-owned persistence root. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Prepare isolated task data without copying or modifying unowned legacy history. */
export function prepareDesktopDataHome(sharedHome: string, dataHome: string, credentialsPath?: string): string {
  mkdirSync(dataHome, { recursive: true, mode: 0o700 })
  const patch = join(dataHome, 'desktop-data.patch.json')
  writeFileSync(patch, JSON.stringify([
    { id: 'credentials', config: { path: credentialsPath ?? join(sharedHome, '.credentials.yaml') } },
    { id: 'session-persistence-jsonl', config: { root: join(dataHome, 'sessions') } },
    { id: 'storage-json', config: { root: join(dataHome, 'storages') } },
    { id: 'attachment-local', config: { mmpHome: dataHome } },
    { id: 'session-query-sqlite', config: { path: ':memory:', openAt: 'never' } },
    { id: 'workspace-controller', config: { documentsDirectory: join(dataHome, 'Documents') } },
  ]), { mode: 0o600 })
  return patch
}
