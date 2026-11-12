import { describe, expect, it } from 'vitest'
import { consoleLinkPayload, libraryMemberTenant } from '../src/ground-billing.ts'

function token(payload: object): string {
  return `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`
}

describe('ground console link', () => {
  it('maps admin ticket to /admin', () => {
    const r = consoleLinkPayload('http://localhost:5201', JSON.stringify({ ticket: 'abc', next: '/admin' }))
    expect(r).toEqual({
      url: 'http://localhost:5201/login?sso=abc&next=%2Fadmin',
      admin: true, hasConsoleAccess: false, isPlatformAdmin: true,
    })
  })
  it('maps enterprise ticket to /console/', () => {
    const r = consoleLinkPayload('http://g', JSON.stringify({ ticket: 'x', next: '/console/' }))
    expect(r.admin).toBe(false)
    expect(r.hasConsoleAccess).toBe(true)
    expect(r.isPlatformAdmin).toBe(false)
  })
  it('rejects missing ticket', () => {
    expect(() => consoleLinkPayload('http://g', '{}')).toThrow()
  })
})

describe('library member tenant', () => {
  it('reads the enterprise from a library member credential', () => {
    const scoped = token({ purpose: 'library-member', tenantId: 'tenant-1' })
    expect(libraryMemberTenant(scoped, 'account')).toBe('tenant-1')
  })
  it('ignores the account credential and other purposes', () => {
    const account = token({ tenantId: 'tenant-1' })
    expect(libraryMemberTenant(account, account)).toBeUndefined()
    expect(libraryMemberTenant(token({ purpose: 'browser-sso', tenantId: 'tenant-1' }), 'account')).toBeUndefined()
    expect(libraryMemberTenant('not-a-jwt', 'account')).toBeUndefined()
  })
})
