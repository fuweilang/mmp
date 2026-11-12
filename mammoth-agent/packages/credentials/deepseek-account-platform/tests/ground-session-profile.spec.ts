import { expect, it } from 'vitest'
import { groundSessionProfile } from '../src/ground-oidc.ts'

const user = { id: 'user-1', name: '猛犸', phone: '13800138000' }

it('treats a missing welcome flag as already seen', () => {
  expect(groundSessionProfile({ user }).welcomeSeen).toBe(true)
})

it('keeps an explicit unseen welcome', () => {
  expect(groundSessionProfile({ user, welcomeSeen: false }).welcomeSeen).toBe(false)
})

it('keeps an explicit seen welcome', () => {
  expect(groundSessionProfile({ user, welcomeSeen: true }).welcomeSeen).toBe(true)
})

it('turns the account picture path into a Ground URL', () => {
  const avatarUrl = '/api/auth/avatars/11111111-1111-4111-8111-111111111111.png'
  expect(groundSessionProfile({ user: { ...user, avatarUrl } }, 'http://127.0.0.1:3100').avatarUrl)
    .toBe(`http://127.0.0.1:3100${avatarUrl}`)
})

it('leaves a missing picture empty', () => {
  expect(groundSessionProfile({ user }, 'http://127.0.0.1:3100').avatarUrl).toBeNull()
})
