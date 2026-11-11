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
