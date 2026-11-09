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

it('inserts one skill chip before the example and leaves the example as the draft text', () => {
  const editor = runtime()
  editor.setDraft('帮我润色这段产品介绍')
  editor.syncSkillChip(skill)
  expect(editor.projection.clipboardText).toBe('帮我润色这段产品介绍')
  expect(editor.projection.detectText).toBe(`${ATOMIC_CHAR}帮我润色这段产品介绍`)
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
  editor.editor.update(() => {
    const text = $getRoot().getAllTextNodes()[0]
    text?.select(0, 0)
  }, { discrete: true })
  expect(editor.editor.dispatchCommand(KEY_BACKSPACE_COMMAND, new KeyboardEvent('keydown', { key: 'Backspace' }))).toBe(true)
  await Promise.resolve()
  expect(editor.skillChip()).toBeNull()
  expect(editor.projection.clipboardText).toBe('原始问题')
  expect(editor.editor.getEditorState().read(() => {
    const selection = $getSelection()
    return $isRangeSelection(selection) && selection.isCollapsed()
  })).toBe(true)
})

it('imports a skill chip as its name and renders the portrait or a plain disc', () => {
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
  plain.unmount()
  const pictured = render(<SkillChipView name={skill.name} icon="https://example.test/a.png" label="移除技能" onRemove={remove} />)
  expect(pictured.container.querySelector('img')?.getAttribute('src')).toBe('https://example.test/a.png')
  fireEvent.mouseDown(pictured.getByRole('button', { name: '移除技能' }))
  fireEvent.click(pictured.getByRole('button', { name: '移除技能' }))
})
