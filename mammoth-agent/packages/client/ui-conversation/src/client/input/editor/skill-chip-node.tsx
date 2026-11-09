/**
 * Inline skill chip. Several may sit in the draft with text between them.
 * This round inserts one, at the start, and the send still carries one skill.
 * The chip is not draft text: clipboard projection is empty.
 */
import type { JSX } from 'react'
import type { LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical'
import {
  $createParagraphNode, $createTextNode, $getAdjacentNode, $getRoot, $getSelection, $isElementNode, $isRangeSelection,
  createCommand, DecoratorNode,
} from 'lexical'
import type { CatalogDraftSelection } from '../../contract/draft-editor.ts'
import { $isCommandChipNode } from './command-chip-node.tsx'
import { SkillChipView } from './SkillChip.tsx'

/** Display identity of one skill chip. The icon is a portrait URL, or null. */
export type SkillChipData = NonNullable<CatalogDraftSelection['skillRef']>

/** Localized control copy. It is not part of the serialized chip. */
export interface SkillChipLabels {
  readonly remove: string
}

const EMPTY_LABELS: SkillChipLabels = { remove: '' }

/** JSON form used by Lexical editor-state APIs, not the saved draft text. */
export type SerializedSkillChipNode = Spread<{
  id: string
  revision: number
  key: string
  name: string
  icon: string | null
}, SerializedLexicalNode>

/** Remove one skill chip by its Lexical identity. */
export const REMOVE_SKILL_CHIP_COMMAND = createCommand<NodeKey>('REMOVE_SKILL_CHIP_COMMAND')

/** One skill as an atomic inline decorator. */
export class SkillChipNode extends DecoratorNode<JSX.Element> {
  __data: SkillChipData
  __labels: SkillChipLabels

  /** Lexical node registry type tag. */
  static override getType(): string {
    return 'skill-chip'
  }

  /** @param node - node to clone. @returns a copy carrying the same NodeKey. */
  static override clone(node: SkillChipNode): SkillChipNode {
    return new SkillChipNode(node.__data, node.__labels, node.__key)
  }

  /**
   * A pasted or imported chip is its name as text. Restoring a live skill
   * stays on the catalog selection, which inserts the chip again.
   * @param json - serialized chip.
   * @returns a plain text node.
   */
  static override importJSON(json: SerializedSkillChipNode): LexicalNode {
    return $createTextNode(json.name)
  }

  /**
   * @param data - skill identity and display fields.
   * @param labels - runtime removal copy.
   * @param key - Lexical clone-path key; absent for fresh nodes.
   */
  constructor(data: SkillChipData, labels: SkillChipLabels = EMPTY_LABELS, key?: NodeKey) {
    super(key)
    this.__data = data
    this.__labels = labels
  }

  /** Serialize the skill identity without its runtime labels. */
  override exportJSON(): SerializedSkillChipNode {
    const data = this.getData()
    return {
      ...super.exportJSON(),
      type: 'skill-chip',
      version: 1,
      id: data.id,
      revision: data.revision,
      key: data.key,
      name: data.name,
      icon: data.icon ?? null,
    }
  }

  /** Mount one non-editable inline host. */
  override createDOM(): HTMLElement {
    const element = document.createElement('span')
    element.setAttribute('data-composer-skill', this.__data.id)
    element.setAttribute('contenteditable', 'false')
    return element
  }

  /** Updates reuse the existing host element. */
  override updateDOM(): boolean {
    return false
  }

  /** The chip sits in the text line. */
  override isInline(): boolean {
    return true
  }

  /** One Backspace or Delete removes the chip. A NodeSelection would swallow the next key. */
  override isKeyboardSelectable(): boolean {
    return false
  }

  /** The chip is not message text. */
  override getTextContent(): string {
    return ''
  }

  /** Skill identity this chip shows. */
  getData(): SkillChipData {
    return this.getLatest().__data
  }

  /** Replace the displayed skill without moving the chip. */
  setData(data: SkillChipData): void {
    const latest = this.getLatest()
    if (sameSkill(latest.__data, data)) return
    latest.getWritable().__data = data
  }

  /** Update the localized remove label. */
  setLabels(labels: SkillChipLabels): void {
    if (this.getLatest().__labels.remove !== labels.remove) this.getWritable().__labels = labels
  }

  /** React face rendered into the host element. */
  override decorate(editor: LexicalEditor): JSX.Element {
    const data = this.getData()
    return (
      <SkillChipView
        name={data.name}
        icon={data.icon ?? null}
        label={this.__labels.remove}
        onRemove={() => { editor.dispatchCommand(REMOVE_SKILL_CHIP_COMMAND, this.__key) }}
      />
    )
  }
}

/**
 * Mint one skill chip.
 * @param data - skill identity.
 * @param labels - removal copy.
 * @returns the fresh node.
 */
export function $createSkillChipNode(data: SkillChipData, labels?: SkillChipLabels): SkillChipNode {
  return new SkillChipNode(data, labels)
}

/**
 * Skill chip type guard.
 * @param node - any node or nullish.
 * @returns whether the node is a SkillChipNode.
 */
export function $isSkillChipNode(node: LexicalNode | null | undefined): node is SkillChipNode {
  return node instanceof SkillChipNode
}

/** Whether two skill identities display and send as the same chip. */
export function sameSkill(left: SkillChipData | null, right: SkillChipData | null): boolean {
  if (left === null || right === null) return left === right
  return left.id === right.id && left.revision === right.revision && left.key === right.key
    && left.name === right.name && (left.icon ?? null) === (right.icon ?? null)
}

/** Skill chips in document order. */
export function $skillChips(): SkillChipNode[] {
  const chips: SkillChipNode[] = []
  for (const block of $getRoot().getChildren()) {
    if (!$isElementNode(block)) continue
    for (const child of block.getChildren()) {
      if ($isSkillChipNode(child)) chips.push(child)
    }
  }
  return chips
}

/**
 * Make the draft show `data`, or no skill chips when `data` is null.
 * A missing chip is inserted at the start of the first block, after a
 * leading command chip. An existing chip keeps its place. Further chips
 * stay where they are so a later insert can accumulate them.
 * @param data - the one skill this round sends, or null to clear every chip.
 */
export function $syncSkillChip(data: SkillChipData | null): void {
  const chips = $skillChips()
  if (data === null) {
    for (const chip of chips) chip.remove()
    return
  }
  const first = chips[0]
  if (first === undefined) {
    $insertSkillChip(data)
    return
  }
  first.setData(data)
}

/** Insert one chip at the start, without taking a command chip's leading seat. */
function $insertSkillChip(data: SkillChipData): void {
  const root = $getRoot()
  let block = root.getFirstChild()
  if (block === null) {
    block = $createParagraphNode()
    root.append(block)
  }
  if (!$isElementNode(block)) return
  const chip = $createSkillChipNode(data)
  const first = block.getFirstChild()
  if ($isCommandChipNode(first)) {
    const next = first.getNextSibling()
    if (next === null) first.insertAfter(chip)
    else next.insertBefore(chip)
    return
  }
  if (first === null) block.append(chip)
  else first.insertBefore(chip)
}

/**
 * The skill chip one Backspace or Delete would remove, or null.
 * @param backward - Backspace when true, Delete when false.
 * @returns the adjacent skill chip.
 */
export function $skillChipBesideCaret(backward: boolean): SkillChipNode | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null
  const adjacent = $getAdjacentNode(selection.anchor, backward)
  return $isSkillChipNode(adjacent) ? adjacent : null
}
