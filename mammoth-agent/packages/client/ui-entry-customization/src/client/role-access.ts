/**
 * Ground session gate for plugin discovery surfaces.
 * A signed-in Ground session hides them for every role, including a platform admin.
 * A Host that is not on Ground (404/405) keeps the developer surfaces.
 */

/** @returns Whether plugin discovery and creation rows may be shown. */
export async function canShowPluginEntries(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl('ground-billing/me', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
    if (response.status === 404 || response.status === 405) return true
    if (response.status === 401) return false
    if (!response.ok) return true
    return false
  } catch {
    return true
  }
}
