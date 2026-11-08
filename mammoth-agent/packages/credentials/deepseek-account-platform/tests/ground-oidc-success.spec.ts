import { expect, it } from 'vitest'
import { groundOidcDoneHtml } from '../src/ground-oidc.ts'

it.each(['zh_CN', 'en_US'] as const)('confirms Desktop sign-in without starting another navigation (%s)', locale => {
  const html = groundOidcDoneHtml(locale, 'desktop')
  expect(html).toContain(locale === 'zh_CN' ? '猛犸智能体客户端已登录' : 'Mammoth Agent is signed in')
  expect(html).not.toMatch(/http-equiv="refresh"|location\.replace|<a |mmp(?:-dev)?:\/\//)
})

it('returns Web logins to their own application origin', () => {
  const html = groundOidcDoneHtml('zh_CN', 'web')
  expect(html).toContain("location.replace('/')")
  expect(html).not.toContain(':3080')
})
