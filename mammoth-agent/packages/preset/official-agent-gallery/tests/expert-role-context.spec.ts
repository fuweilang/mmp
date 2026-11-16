import { expect, it } from 'vitest'
import { answerClose, expertRoleContext } from '../src/expert-role-context.ts'

it('tells the current expert not to keep the previous speaker', () => {
  const text = expertRoleContext({ 1: { name: '猛犸大总管' } }, '获客文案大师', 2)
  expect(text).toContain('当前回答者：获客文案大师')
  expect(text).toContain('历史第1轮回答者：猛犸大总管')
  expect(answerClose('获客文案大师', [])).toContain('本轮由「获客文案大师」回答')
})

it('tells the lead to summarize teammates from this turn', () => {
  const text = answerClose('获客文案大师', ['数据分析师'])
  expect(text).toContain('数据分析师')
  expect(text).toContain('不要说这一轮只能派一个专家')
})
