// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { CatalogIcon } from '../src/client/CatalogIcon.tsx'

afterEach(() => cleanup())

const transparentPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('CatalogIcon', () => {
  it('shows only the default SVG when there is no portrait URL', () => {
    const { container } = render(<CatalogIcon catalogKey="writer" kind="case" src={null} />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows only the image (no SVG) while a portrait URL is loading/shown', () => {
    const { container } = render(
      <CatalogIcon catalogKey="vivo" kind="case" src="https://example.test/vivo-logo.png" />,
    )
    const artwork = container.querySelector('[class*="artwork"]') as HTMLElement
    expect(artwork.getAttribute('data-has-image')).toBe('true')
    expect(container.querySelector('img[src="https://example.test/vivo-logo.png"]')).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('falls back to SVG after image error and clears failure when URL changes', () => {
    const { container, rerender } = render(
      <CatalogIcon catalogKey="vivo" kind="case" src="https://example.test/missing.png" />,
    )
    const broken = container.querySelector('img') as HTMLImageElement
    fireEvent.error(broken)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).toBeTruthy()

    rerender(<CatalogIcon catalogKey="vivo" kind="case" src="https://example.test/ok.png" />)
    expect(container.querySelector('img[src="https://example.test/ok.png"]')).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('keeps transparent portraits free of the default SVG layer', () => {
    const { container } = render(<CatalogIcon catalogKey="vivo" kind="case" src={transparentPng} />)
    expect(container.querySelector('img')).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('still uses the kind glyph for skills without an icon URL', () => {
    const { container } = render(<CatalogIcon catalogKey="brief" kind="file" />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })
})
