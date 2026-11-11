import { Context, Service } from '@mammoth-ai/cordis'
import type { ImageAttachmentRef, SaveImageAttachment } from '@mammoth-ai/mmp-attachment'
import type { ToolExecutionResult, ToolRunContext } from '@mammoth-ai/mmp-tools'
import { afterEach, expect, it, vi } from 'vitest'
import { createGroundLibrarySearchTool, readLibrarySearch } from '../src/ground-library-search.ts'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64')

class ImageStore extends Service {
  static inject = []
  readonly saved: SaveImageAttachment[] = []
  constructor(ctx: Context) { super(ctx, 'attachments') }
  async saveImages(inputs: readonly SaveImageAttachment[]): Promise<ImageAttachmentRef[]> {
    this.saved.push(...inputs)
    return inputs.map((input, index) => ({
      attachmentId: `att-${index}` as ImageAttachmentRef['attachmentId'],
      mediaType: input.mediaType,
      bytes: input.data.byteLength,
      width: 1,
      height: 1,
      ...(input.name === undefined ? {} : { name: input.name }),
    }))
  }
}

class ModelInfo extends Service {
  static inject = []
  constructor(ctx: Context, private readonly vision: boolean) { super(ctx, 'llm') }
  resolveModelInfo = async () => ({ inputModalities: this.vision ? ['text', 'image'] as const : ['text'] as const })
}

const imageHit = {
  nodeId: 'n1', versionId: 'v1', versionNo: 1, name: '小悟空.jpg', locator: 'image', locatorKind: 'image',
  quote: '', matched: 'name', image: true,
}
const textHit = {
  nodeId: 'n2', versionId: 'v2', versionNo: 2, name: '说明.md', locator: 'paragraph:1', locatorKind: 'paragraph',
  quote: '泡泡玛特', matched: 'text',
}

afterEach(() => vi.unstubAllGlobals())

function harness(payload: unknown, vision: boolean, download: () => Response = () => new Response(PNG)) {
  const ctx = new Context()
  const images = new ImageStore(ctx)
  new ModelInfo(ctx, vision)
  let credential: string | undefined = 'account-a'
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
    calls.push(url.pathname)
    if (url.pathname.endsWith('/search')) return Response.json(payload)
    return download()
  }))
  const tool = createGroundLibrarySearchTool(ctx, 'https://ground.test', async () => credential, async () => { credential = undefined }, 1000, new AbortController().signal)
  const exec = {
    signal: new AbortController().signal,
    agent: { options: { provider: 'deepseek', model: 'deepseek-v4' }, session: { requestHeader: () => undefined } },
  } as ToolRunContext
  return {
    ctx, images, calls, tool, exec,
    async run(q = '小悟空') {
      const value = await tool.execute({ q }, exec)
      const fallback = tool.output.render({ q }, value)
      const projected = tool.projectContent?.(exec, { isError: false, value, content: fallback } as ToolExecutionResult)
      return { value, projected: projected ?? fallback }
    },
  }
}

it('accepts an image hit and still rejects a video-shaped locator', () => {
  expect(readLibrarySearch({ query: '小悟空', truncated: false, hits: [imageHit, textHit] }).hits[0]?.image).toBe(true)
  expect(() => readLibrarySearch({ query: 'x', truncated: false, hits: [{ ...imageHit, locatorKind: 'video' }] })).toThrow('LIBRARY_SEARCH_INVALID')
})

it('attaches the original image when the current model accepts images', async () => {
  const h = harness({ query: '小悟空', truncated: false, hits: [textHit, imageHit] }, true)
  try {
    const { projected } = await h.run()
    expect(h.calls).toEqual(['/api/library/search', '/api/library/nodes/n1/download'])
    expect(h.images.saved).toMatchObject([{ mediaType: 'image/png', name: '小悟空.jpg' }])
    expect(projected.map(block => block.type)).toEqual(['text', 'image'])
    const text = projected[0]?.type === 'text' ? projected[0].text : ''
    expect(text).toContain('[说明.md] version 2 paragraph:paragraph:1')
    expect(text).toContain('The original image is attached below.')
    expect(projected[1]).toMatchObject({ type: 'image', attachment: { attachmentId: 'att-0', mediaType: 'image/png' } })
  } finally { await h.ctx.fiber.dispose() }
})

it('names a found image without downloading it when the model cannot view images', async () => {
  const h = harness({ query: '小悟空', truncated: false, hits: [imageHit] }, false)
  try {
    const { projected } = await h.run()
    expect(h.calls).toEqual(['/api/library/search'])
    expect(h.images.saved).toEqual([])
    expect(projected).toEqual([{
      type: 'text',
      text: '[小悟空.jpg] version 1 image file. This file was found, but the current model cannot view images.',
    }])
  } finally { await h.ctx.fiber.dispose() }
})

it('keeps a text search on the excerpt path', async () => {
  const h = harness({ query: '泡泡玛特', truncated: false, hits: [textHit] }, true)
  try {
    const { projected } = await h.run('泡泡玛特')
    expect(h.calls).toEqual(['/api/library/search'])
    expect(projected).toEqual([{ type: 'text', text: '[说明.md] version 2 paragraph:paragraph:1\n泡泡玛特' }])
  } finally { await h.ctx.fiber.dispose() }
})

it('does not attach bytes that are not a viewable image', async () => {
  const h = harness({ query: '小悟空', truncated: false, hits: [imageHit] }, true, () => new Response(Buffer.from('not-an-image')))
  try {
    const { projected } = await h.run()
    expect(h.images.saved).toEqual([])
    const text = projected[0]?.type === 'text' ? projected[0].text : ''
    expect(text).toContain('not a PNG, JPEG, WebP, or GIF')
    expect(projected.some(block => block.type === 'image')).toBe(false)
  } finally { await h.ctx.fiber.dispose() }
})
