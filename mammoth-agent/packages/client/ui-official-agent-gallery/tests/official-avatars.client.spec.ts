import { describe, expect, it } from 'vitest'
import { hasBundledOfficialAvatar, resolveCardAvatarSrc } from '../src/client/official-avatars.ts'

describe('official-avatars', () => {
  it('prefers Ground avatarUrl over the bundled same-key portrait', () => {
    expect(resolveCardAvatarSrc('growth', 'https://ground.example/avatars/growth.jpg'))
      .toBe('https://ground.example/avatars/growth.jpg')
  })

  it('uses a bundled same-key portrait when Ground has none', () => {
    const src = resolveCardAvatarSrc('growth', null)
    expect(src).toEqual(expect.stringMatching(/growth\.jpg/))
    expect(hasBundledOfficialAvatar('growth')).toBe(true)
  })

  it('applies evidenced historical remaps for keys without a same-name file', () => {
    expect(resolveCardAvatarSrc('niche', null)).toEqual(expect.stringMatching(/data\.jpg/))
    expect(resolveCardAvatarSrc('ip', null)).toEqual(expect.stringMatching(/growth\.jpg/))
    expect(resolveCardAvatarSrc('gzh', null)).toEqual(expect.stringMatching(/copy\.jpg/))
    expect(resolveCardAvatarSrc('sell', null)).toEqual(expect.stringMatching(/live\.jpg/))
    expect(resolveCardAvatarSrc('method', null)).toEqual(expect.stringMatching(/trans\.jpg/))
    expect(resolveCardAvatarSrc('interview', null)).toEqual(expect.stringMatching(/qc\.jpg/))
  })

  it('keeps glyph-only keys without a shipped or remapped portrait', () => {
    expect(resolveCardAvatarSrc('mammoth', null)).toBeUndefined()
    expect(resolveCardAvatarSrc('c3274112ed041', '')).toBeUndefined()
    expect(hasBundledOfficialAvatar('mammoth')).toBe(false)
  })
})
