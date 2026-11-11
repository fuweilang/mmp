import { expect, it } from 'vitest'
import { parseLibraryCitationLink } from '../src/client/citation-link.ts'
const base = 'http://127.0.0.1:3080/'
const valid = '/ground-library/nodes/node-1/source?versionId=ver-1&locator=paragraph%3A2'
it.each([
  [valid, base],
  ['http://127.0.0.1:3080'+valid, base],
  [valid, 'mmp-app://app/index.html'],
  ['mmp-app://app'+valid, 'mmp-app://app/index.html'],
])('opens the exact stored source in %s', (href, origin) => {
  expect(parseLibraryCitationLink(href, origin)).toEqual({ nodeId: 'node-1', versionId: 'ver-1', locator: 'paragraph:2' })
})
it('preserves compound paragraph or PDF page locators', () => {
  expect(parseLibraryCitationLink(valid.replace('paragraph%3A2','page%3A1%2Cpage%3A2'),base)).toEqual({nodeId:'node-1',versionId:'ver-1',locator:'page:1,page:2'})
})
it.each([
  'https://evil.test'+valid, '//evil.test'+valid, 'javascript:alert(1)',
  '/ground-library/nodes/n/source?locator=page:1', '/ground-library/nodes/n/source?versionId=v',
  valid+'&versionId=other', valid+'&locator=page:3', valid+'&tenantId=foreign', valid+'#extra',
  valid.replace('paragraph%3A2','page:0'), valid.replace('paragraph%3A2','page:NaN'),
  valid.replace('node-1','..'), valid.replace('node-1','%2e%2e'), valid.replace('node-1','n%2fv'),
  valid.replace('node-1','n%5cv'), valid.replace('node-1','x/../node-1'),
  valid.replace('ver-1','v%26tenantId%3Dother'), ' '+valid, valid+'\n',
  '/api/library/nodes/node-1/source?versionId=ver-1&locator=page:1',
])('refuses an untrusted or incomplete source destination %s', href => {
  expect(parseLibraryCitationLink(href,base)).toBeUndefined()
})
