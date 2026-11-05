import { describe, expect, it } from 'vitest'
import { consoleLinkPayload } from '../src/ground-billing.ts'

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
