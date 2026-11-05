import { expect, it } from 'vitest'
import { groundOidcDoneHtml } from '../src/ground-oidc.ts'

it.each(['zh_CN', 'en_US'] as const)('returns Desktop login browsers to the terminal (%s)', locale => {
  const html = groundOidcDoneHtml(locale, 'desktop')
  expect(html).toContain('content="0;url=http://127.0.0.1:3080/"')
  expect(html).toContain('location.replace("http://127.0.0.1:3080/")')
  expect(html).toContain('href="http://127.0.0.1:3080/"')
  expect(html).not.toContain('window.close')
  expect(html).not.toContain('mmp://open')
})

it('returns Web logins to their own application origin', () => {
  const html = groundOidcDoneHtml('zh_CN', 'web')
  expect(html).toContain("location.replace('/')")
  expect(html).not.toContain(':3080')
})

it('returns packaged production logins to the public Web root', () => {
  const html = groundOidcDoneHtml('zh_CN', 'desktop', 'https://www.mmai.vip/')
  expect(html).toContain('location.replace("https://www.mmai.vip/")')
  expect(html).not.toContain('127.0.0.1')
  expect(() => groundOidcDoneHtml('zh_CN', 'desktop', 'https://www.mmai.vip/agent')).toThrow('return URL')
})
