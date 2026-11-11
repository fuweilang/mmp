/** Stable source addresses carry identifiers only; Ground authorizes the actual read. */
export type LibraryCitationTarget = { nodeId: string; versionId: string; locator: string }

/**
 * Parse complete source links without normalizing traversal into valid targets.
 * @param href - Candidate source address.
 * @param base - Current application URL used to enforce the same origin.
 * @returns Exact version and locator identifiers, or undefined for an invalid address.
 */
export function parseLibraryCitationLink(href: string, base: string): LibraryCitationTarget | undefined {
  if (href.length > 16_384 || href.trim() !== href || /[\\\u0000-\u001f\u007f]/.test(href) || href.startsWith('//')) return undefined
  const path = href.split(/[?#]/u)[0] ?? ''
  if (/%(?:2e|2f|5c)/i.test(path) || /(?:^|\/)\.{1,2}(?:\/|$)/u.test(path)) return undefined
  let url: URL, owner: URL
  try { owner = new URL(base); url = new URL(href, owner) } catch { return undefined }
  if (!['http:', 'https:', 'mmp-app:'].includes(owner.protocol)
    || url.protocol !== owner.protocol || url.host !== owner.host || url.username || url.password || url.hash) return undefined
  const match = /^\/ground-library\/nodes\/([A-Za-z0-9_-]+)\/source$/u.exec(url.pathname)
  if (!match || [...url.searchParams.keys()].some(key => key !== 'versionId' && key !== 'locator')
    || url.searchParams.getAll('versionId').length !== 1 || url.searchParams.getAll('locator').length !== 1) return undefined
  const versionId = url.searchParams.get('versionId')!, locator = url.searchParams.get('locator')!
  if (!/^[A-Za-z0-9_-]+$/u.test(versionId) || !/^(?:page|paragraph):[1-9]\d*(?:,(?:page|paragraph):[1-9]\d*)*$/u.test(locator)) return undefined
  return { nodeId: match[1]!, versionId, locator }
}
