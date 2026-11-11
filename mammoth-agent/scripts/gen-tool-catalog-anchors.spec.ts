import { expect, it } from 'vitest'
import { render, type ToolCatalog } from './gen-tool-catalog.ts'

it('retains published documentation links when package anchors use the Mammoth scope', () => {
  const catalog: ToolCatalog = [{ pkg: '@mammoth-ai/mmp-tool-skill', schemas: [], sources: {}, requires: [], writes: [] }]
  const markdown = render(catalog)
  expect(markdown).toContain('<a id="mammoth-aimmp-tool-skill"></a>')
  expect(markdown).toContain('<a id="deepseek-aidsh-tool-skill"></a>')
})
