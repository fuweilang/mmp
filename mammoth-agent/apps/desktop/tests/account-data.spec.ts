import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { PlatformSession } from '@mammoth-ai/mmp-deepseek-account'
import type { AccountUserId } from '@mammoth-ai/mmp-deepseek-account/types'
import { accountDataHome, DesktopAccountData } from '../src/account-data.ts'

const grant = (user: string, tenant: string | null = 'enterprise-a', origin = 'https://ground.example'): PlatformSession => ({
  origin, userId: user as AccountUserId,
  token: `header.${Buffer.from(JSON.stringify({ sub: user, tenantId: tenant })).toString('base64url')}.signature`,
})

describe('desktop account data isolation', () => {
  it('separates users, enterprises, issuers and signed-out state with stable directories across launches', () => {
    const a = accountDataHome('/data', grant('alice'), '/anonymous')
    expect(accountDataHome('/data', grant('alice'), '/other-anonymous')).toBe(a)
    expect(a).not.toMatch(/alice|enterprise-a|header|signature/)
    expect(accountDataHome('/data', grant('bob'), '/anonymous')).not.toBe(a)
    expect(accountDataHome('/data', grant('alice', 'enterprise-b'), '/anonymous')).not.toBe(a)
    expect(accountDataHome('/data', grant('alice', null), '/anonymous')).not.toBe(a)
    expect(accountDataHome('/data', grant('alice', 'enterprise-a', 'https://other.example'), '/anonymous')).not.toBe(a)
    expect(accountDataHome('/data', null, '/anonymous')).toBe('/anonymous')
    expect(accountDataHome('/data', { ...grant('alice'), userId: null }, '/anonymous')).toBe('/anonymous')
    expect(a).toContain(join('desktop-accounts', ''))
  })

  it('rejects a grant whose subject does not match the verified profile', () => {
    expect(() => accountDataHome('/data', { ...grant('alice'), userId: 'bob' as AccountUserId }, '/anonymous')).toThrow('identity')
  })

  it('blocks immediately and stops/replaces the Host before revealing each account; logout never adopts history', async () => {
    const calls: string[] = []
    const data = new DesktopAccountData('/data', {
      block: () => { calls.push('block') },
      restart: async () => { calls.push(`restart:${data.home}`) },
      resume: async () => { calls.push('resume') }, failed: error => { throw error },
    })
    const anonymous = data.home
    data.update(grant('alice'))
    expect(calls).toEqual(['block'])
    await vi.waitFor(() => { expect(data.switching).toBe(false) })
    const alice = data.home
    data.update(grant('bob'))
    await vi.waitFor(() => { expect(data.switching).toBe(false) })
    expect(data.home).not.toBe(alice)
    data.update(grant('alice'))
    await vi.waitFor(() => { expect(data.switching).toBe(false) })
    expect(data.home).toBe(alice)
    data.update(null)
    await vi.waitFor(() => { expect(data.switching).toBe(false) })
    expect(data.home).toBe(anonymous)
    expect(calls).toEqual([
      'block', `restart:${alice}`, 'resume',
      'block', `restart:${accountDataHome('/data', grant('bob'), anonymous)}`, 'resume',
      'block', `restart:${alice}`, 'resume', 'block', `restart:${anonymous}`, 'resume',
    ])
  })

  it('serializes rapid account changes and never reveals the superseded account', async () => {
    const stopped = Promise.withResolvers<void>()
    const homes: string[] = []
    const resume = vi.fn(async () => {})
    const data = new DesktopAccountData('/data', {
      block: vi.fn(), restart: async () => { homes.push(data.home); if (homes.length === 1) await stopped.promise },
      resume, failed: error => { throw error },
    })
    data.update(grant('alice'))
    await vi.waitFor(() => { expect(homes).toHaveLength(1) })
    data.update(grant('bob'))
    stopped.resolve()
    await vi.waitFor(() => { expect(data.switching).toBe(false) })
    expect(homes).toHaveLength(2)
    expect(resume).toHaveBeenCalledOnce()
    expect(data.home).toBe(accountDataHome('/data', grant('bob'), data.anonymousHome))
  })

  it('fails closed when the old Host cannot stop', async () => {
    const failed = vi.fn(), resume = vi.fn(async () => {})
    const data = new DesktopAccountData('/data', {
      block: vi.fn(), restart: async () => { throw new Error('old Host still running') }, resume, failed,
    })
    data.update(grant('alice'))
    await vi.waitFor(() => { expect(failed).toHaveBeenCalledOnce() })
    expect(resume).not.toHaveBeenCalled()
    expect(data.settled).toBe(false)
  })
})
