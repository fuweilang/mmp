// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MarkdownDelegateProvider } from '../src/index.ts'
import { MarkdownText } from './markdown-test-components.tsx'
afterEach(cleanup)
const href = '/source/item?version=one'
const text = `[Source](${href})`
it('delegates application navigation only after a click', () => {
  const activate = vi.fn(), external = vi.fn(), file = vi.fn()
  const view = render(<MarkdownDelegateProvider resolveApplicationLink={value => value === href ? activate : undefined} openExternalLink={external} openFile={file}><MarkdownText text={text} /></MarkdownDelegateProvider>)
  expect(activate).not.toHaveBeenCalled()
  fireEvent.click(view.getByRole('button', { name: 'Source' }))
  expect(activate).toHaveBeenCalledOnce()
  expect(external).not.toHaveBeenCalled(); expect(file).not.toHaveBeenCalled()
})
it('keeps streaming application links inert until the message settles', () => {
  const activate = vi.fn(), resolveApplicationLink = (value: string) => value === href ? activate : undefined
  const view = render(<MarkdownDelegateProvider resolveApplicationLink={resolveApplicationLink}><MarkdownText text={text} streaming /></MarkdownDelegateProvider>)
  expect(view.queryByRole('button')).toBeNull(); expect(view.getByText('Source')).toBeTruthy()
  view.rerender(<MarkdownDelegateProvider resolveApplicationLink={resolveApplicationLink}><MarkdownText text={text} streaming={false} /></MarkdownDelegateProvider>)
  fireEvent.click(view.getByRole('button', { name: 'Source' })); expect(activate).toHaveBeenCalledOnce()
})
it('retains ordinary file and external link behavior and rejects unsafe destinations', () => {
  const file = vi.fn(), external = vi.fn()
  const view = render(<MarkdownDelegateProvider resolveApplicationLink={() => undefined} openFile={file} openExternalLink={external}><MarkdownText text={'[Local](./readme.md) [Web](https://example.test/page) [Unsafe](javascript:alert%281%29)'} /></MarkdownDelegateProvider>)
  fireEvent.click(view.getByRole('button', { name: 'Local' })); expect(file).toHaveBeenCalledWith('./readme.md', undefined)
  fireEvent.click(view.getByRole('link', { name: 'Web' })); expect(external).toHaveBeenCalledWith('https://example.test/page')
  expect(view.queryByRole('link', { name: 'Unsafe' })).toBeNull()
})
it('does not retain a stale activation when a cached message changes navigation owner', () => {
  const first = vi.fn(), second = vi.fn()
  const view = render(<MarkdownDelegateProvider resolveApplicationLink={() => first}><MarkdownText text={text} /></MarkdownDelegateProvider>)
  view.rerender(<MarkdownDelegateProvider resolveApplicationLink={() => second}><MarkdownText text={text} /></MarkdownDelegateProvider>)
  fireEvent.click(view.getByRole('button', { name: 'Source' })); expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledOnce()
})
