import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGroundWebIdentity, groundWebCookie, GroundWebIdentityConflict } from '../src/web-sso.ts'

const token = (sub = 'user-1', tenantId: string | null = 'tenant-1', exp = Math.floor(Date.now() / 1000) + 3600): string =>
  `header.${Buffer.from(JSON.stringify({ sub, tenantId, exp })).toString('base64url')}.signature`
const request = (jwt?: string) => ({ method: 'GET', url: 'http://127.0.0.1:3080/',
  headers: new Headers({ host: '127.0.0.1:3080', ...(jwt ? { cookie: `mammothai_access_token=${jwt}` } : {}) }) })
function setup() {
  const acceptGrant = vi.fn(async () => {})
  const policy = createGroundWebIdentity({ groundOrigin: 'http://127.0.0.1:5201', webOrigin: 'http://127.0.0.1:3080',
    cookieName: 'mammothai_access_token', requestTimeoutMs: 1000, acceptGrant })
  return { acceptGrant, policy }
}
afterEach(() => vi.restoreAllMocks())

describe('Ground local Web identity', () => {
  it('sends an anonymous browser to the shared login/register page with a clean return URL', async () => {
    const { policy, acceptGrant } = setup()
    const result = await policy.authorizeIndex(request())
    expect(result).toBeInstanceOf(Response)
    if (result === true) throw new Error('expected a redirect')
    expect(result.status).toBe(303)
    const url = new URL(result.headers.get('location')!)
    expect(url.origin + url.pathname).toBe('http://127.0.0.1:5201/login')
    expect(url.searchParams.get('next')).toBe('http://127.0.0.1:3080/')
    expect(url.searchParams.has('token')).toBe(false)
    expect(acceptGrant).not.toHaveBeenCalled()
    policy.dispose()
  })

  it('verifies with Ground before importing a grant and admitting the same browser', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ user: { id: 'user-1' }, currentTenant: { id: 'tenant-1' } })))
    const { policy, acceptGrant } = setup()
    const jwt = token()
    expect(policy.isAuthenticated(request(jwt))).toBe(false)
    expect(await policy.authorizeIndex(request(jwt))).toBe(true)
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://127.0.0.1:5201/api/auth/me')
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: `Bearer ${jwt}` })
    expect(acceptGrant).toHaveBeenCalledWith(jwt, { userId: 'user-1', tenantId: 'tenant-1' }, expect.any(Object))
    expect(policy.isAuthenticated(request(jwt))).toBe(true)
    expect(policy.isAuthenticated(request())).toBe(false)
    expect(policy.isAuthenticated(request(token('other-user')))).toBe(false)
    policy.clear()
    expect(policy.isAuthenticated(request(jwt))).toBe(false)
    policy.dispose()
  })

  it('rejects account/tenant conflicts, expired credentials and Ground errors', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ user: { id: 'user-1' }, currentTenant: { id: 'tenant-1' } })))
    const { policy, acceptGrant } = setup()
    acceptGrant.mockRejectedValueOnce(new GroundWebIdentityConflict())
    const conflict = await policy.authorizeIndex(request(token()))
    expect(conflict !== true && conflict.status).toBe(409)
    expect(policy.isAuthenticated(request(token()))).toBe(false)
    const expired = await policy.authorizeIndex(request(token('user-1', 'tenant-1', 1)))
    expect(expired !== true && expired.status).toBe(303)
    const tenant = await policy.authorizeIndex(request(token('user-1', 'other-tenant')))
    expect(tenant !== true && tenant.status).toBe(403)
    fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }))
    const unauthorized = await policy.authorizeIndex(request(token()))
    expect(unauthorized !== true && unauthorized.status).toBe(303)
    fetcher.mockRejectedValueOnce(new Error('offline'))
    const offline = await policy.authorizeIndex(request(token()))
    expect(offline !== true && offline.status).toBe(502)
    policy.dispose()
  })

  it('rejects ambiguous cookies and a deployment whose browser cookies cannot be shared', () => {
    expect(groundWebCookie({ headers: { cookie: 'session=a; session=b' } }, 'session')).toBeUndefined()
    expect(groundWebCookie({ headers: { cookie: 'session=%XX' } }, 'session')).toBeUndefined()
    expect(() => createGroundWebIdentity({ groundOrigin: 'http://localhost:5201', webOrigin: 'http://127.0.0.1:3080',
      cookieName: 'session', requestTimeoutMs: 1000, acceptGrant: async () => {} })).toThrow('matching HTTP loopback hostnames')
  })
})
