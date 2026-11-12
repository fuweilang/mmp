// @vitest-environment jsdom
/** Skill chips sit in the draft, stay out of the sent text, and delete with one Backspace. */
/** @jsxImportSource react */
import { expect, it, onTestFinished } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { $createParagraphNode, $getRoot, $isElementNode, $isRangeSelection, $getSelection, KEY_BACKSPACE_COMMAND } from 'lexical'
import { DraftEditorRuntime } from '../src/client/input/editor/runtime.ts'
import { $createCommandChipNode } from '../src/client/input/editor/command-chip-node.tsx'
import { $skillChips, SkillChipNode } from '../src/client/input/editor/skill-chip-node.tsx'
import { SkillChipView } from '../src/client/input/editor/SkillChip.tsx'
import { ATOMIC_CHAR } from '../src/client/input/editor/projection.ts'
import type { CommandClaim } from '../src/client/contract/input.ts'

const skill = { id: 'skill-1', revision: 2, key: 'document', name: '文档技能', icon: null }

function runtime(): DraftEditorRuntime {
  const runtime = new DraftEditorRuntime({
    onUpdate: () => { runtime.refreshProjection() },
    quoteLabels: () => ({ remove: 'Remove quote' }),
    skillLabels: () => ({ remove: '移除技能' }),
    openReference: () => false,
    lexicon: () => new Map(),
    resolveLexicon: () => undefined,
  })
  const dispose = runtime.register()
  onTestFinished(dispose)
  return runtime
}

it('inserts one skill chip at the caret and leaves the example as the draft text', () => {
  const editor = runtime()
  editor.setDraft('帮我润色这段产品介绍')
  editor.syncSkillChip(skill)
  expect(editor.projection.clipboardText).toBe('帮我润色这段产品介绍')
  expect(editor.projection.detectText).toBe(`帮我润色这段产品介绍${ATOMIC_CHAR}`)
  expect(editor.skillChip()).toEqual(skill)
  editor.syncSkillChip(skill)
  expect(editor.editor.getEditorState().read(() => $skillChips())).toHaveLength(1)
  editor.syncSkillChip({ ...skill, name: '文档整理' })
  expect(editor.skillChip()?.name).toBe('文档整理')
  expect(editor.projection.clipboardText).toBe('帮我润色这段产品介绍')
  editor.syncSkillChip(null)
  expect(editor.skillChip()).toBeNull()
  expect(editor.projection.clipboardText).toBe('帮我润色这段产品介绍')
})

it('adds another skill at the caret and keeps the typed question', () => {
  const editor = runtime()
  const other = { id: 'skill-2', revision: 4, key: 'market', name: '行情技能', icon: null }
  editor.setDraft('小米有什么汽车推荐？')
  editor.syncSkillChip(skill)
  expect(editor.projection.detectText).toBe(`小米有什么汽车推荐？${ATOMIC_CHAR}`)
  editor.editor.update(() => {
    const text = $getRoot().getAllTextNodes()[0]
    text?.select(0, 0)
  }, { discrete: true })
  editor.syncSkillChips([skill, other])
  expect(editor.projection.clipboardText).toBe('小米有什么汽车推荐？')
  expect(editor.projection.detectText).toBe(`${ATOMIC_CHAR}小米有什么汽车推荐？${ATOMIC_CHAR}`)
  expect(editor.skillChips().map(item => item.id)).toEqual([other.id, skill.id])
  editor.syncSkillChips([skill, other])
  expect(editor.skillChips().map(item => item.id)).toEqual([other.id, skill.id])
})

it('puts the skill chip after a leading command chip', () => {
  const editor = runtime()
  const claim: CommandClaim = { name: 'goal', token: '/goal ', submit: async () => ({ kind: 'success' as const }) }
  editor.editor.update(() => {
    const paragraph = $createParagraphNode()
    paragraph.append($createCommandChipNode(claim))
    $getRoot().append(paragraph)
  }, { discrete: true })
  editor.syncSkillChip(skill)
  const order = editor.editor.getEditorState().read(() => {
    const first = $getRoot().getFirstChild()
    return $isElementNode(first) ? first.getChildren().map((node) => node.getType()) : []
  })
  expect(order[0]).toBe('command-chip')
  expect(order[1]).toBe('skill-chip')
})

it('removes the skill chip with one Backspace and keeps the example text', async () => {
  const editor = runtime()
  editor.setDraft('原始问题')
  editor.syncSkillChip(skill)
  editor.editor.update(() => { $getRoot().selectEnd() }, { discrete: true })
  expect(editor.editor.dispatchCommand(KEY_BACKSPACE_COMMAND, new KeyboardEvent('keydown', { key: 'Backspace' }))).toBe(true)
  await Promise.resolve()
  expect(editor.skillChip()).toBeNull()
  expect(editor.projection.clipboardText).toBe('原始问题')
  expect(editor.editor.getEditorState().read(() => {
    const selection = $getSelection()
    return $isRangeSelection(selection) && selection.isCollapsed()
  })).toBe(true)
})

it('puts saved skill chips back beside the same characters', () => {
  const editor = runtime()
  const other = { id: 'skill-2', revision: 4, key: 'market', name: '行情技能', icon: null }
  const text = '请用这段说明'
  editor.setDraft(text)
  editor.syncSkillChips([{ ...skill, offset: 2 }, { ...other, offset: 2 }])
  expect(editor.projection.clipboardText).toBe(text)
  expect(editor.projection.detectText).toBe(`${text.slice(0, 2)}${ATOMIC_CHAR}${ATOMIC_CHAR}${text.slice(2)}`)
  expect(editor.skillChipAnchors().map(item => item.offset)).toEqual([2, 2])
  editor.setDraft('')
  editor.setDraft(text)
  editor.syncSkillChips([{ ...other, offset: 0 }, { ...skill, offset: text.length }])
  expect(editor.projection.clipboardText).toBe(text)
  expect(editor.projection.detectText).toBe(`${ATOMIC_CHAR}${text}${ATOMIC_CHAR}`)
  expect(editor.skillChips().map(item => item.id)).toEqual([other.id, skill.id])
  const wrapped = '艺术作品的场景。\n请继续'
  const breakAt = wrapped.indexOf('\n') + 1
  editor.setDraft(wrapped)
  editor.syncSkillChips([{ ...skill, offset: 0 }, { ...other, offset: breakAt }])
  expect(editor.projection.clipboardText).toBe(wrapped)
  expect(editor.projection.detectText).toBe(`${ATOMIC_CHAR}${wrapped.slice(0, breakAt)}${ATOMIC_CHAR}${wrapped.slice(breakAt)}`)
})

it('imports a skill chip as its name and renders a portrait only when one exists', () => {
  const editor = runtime()
  editor.editor.update(() => {
    const node = SkillChipNode.importJSON({
      type: 'skill-chip', version: 1, id: skill.id, revision: skill.revision, key: skill.key, name: skill.name, icon: null,
    })
    expect(node.getTextContent()).toBe(skill.name)
  }, { discrete: true })
  const remove = () => {}
  const plain = render(<SkillChipView name={skill.name} icon={null} label="移除技能" onRemove={remove} />)
  expect(plain.getByRole('button', { name: '移除技能' })).toBeTruthy()
  expect(plain.container.querySelector('img')).toBeNull()
  plain.unmount()
  const pictured = render(<SkillChipView name={skill.name} icon="https://example.test/a.png" label="移除技能" onRemove={remove} />)
  expect(pictured.container.querySelector('img')?.getAttribute('src')).toBe('https://example.test/a.png')
  fireEvent.mouseDown(pictured.getByRole('button', { name: '移除技能' }))
  fireEvent.click(pictured.getByRole('button', { name: '移除技能' }))
})
