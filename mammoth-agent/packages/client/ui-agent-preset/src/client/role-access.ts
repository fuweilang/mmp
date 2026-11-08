/**
 * Ground role claims for agent-preset visibility. Reuses the same-origin
 * `ground-billing/me` proxy already used by account settings — no new auth model.
 */

export type PresetRoleAccess =
  | { kind: 'pending' }
  | { kind: 'native' }
  | { kind: 'ground'; isPlatformAdmin: boolean }

/** Full roster while pending would flash admin-only modes on Ground web; treat pending as restricted. */
export function canManageAgentPresetSettings(access: PresetRoleAccess): boolean {
  if (access.kind === 'native') return true
  if (access.kind === 'ground') return access.isPlatformAdmin
  return false
}

/** Hero/menu visibility helper aligned with {@link canManageAgentPresetSettings}. */
export function roleAccessForFilter(access: PresetRoleAccess): { kind: 'native' | 'ground'; isPlatformAdmin: boolean } {
  if (access.kind === 'native') return { kind: 'native', isPlatformAdmin: false }
  if (access.kind === 'ground') return access
  // pending: behave like ordinary Ground user until /me resolves
  return { kind: 'ground', isPlatformAdmin: false }
}

/**
 * Read platform-admin from Ground session. 404/405 → native DSH (show all).
 * Network errors → native (preserve desktop). 401 → ground non-admin.
 */
export async function readPresetRoleAccess(
  fetchImpl: typeof fetch = fetch,
): Promise<Exclude<PresetRoleAccess, { kind: 'pending' }>> {
  try {
    const response = await fetchImpl('ground-billing/me', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
    if (response.status === 404 || response.status === 405) return { kind: 'native' }
    if (response.status === 401) return { kind: 'ground', isPlatformAdmin: false }
    if (!response.ok) return { kind: 'native' }
    const me = await response.json() as { user?: { isPlatformAdmin?: boolean } }
    return { kind: 'ground', isPlatformAdmin: me.user?.isPlatformAdmin === true }
  } catch {
    return { kind: 'native' }
  }
}
