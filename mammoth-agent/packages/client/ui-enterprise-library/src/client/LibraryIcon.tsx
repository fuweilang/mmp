import type { PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type {} from '@mammoth-ai/mmp-client-ui-sidebar/client'

/** Sidebar glyph for the library panel. The sidebar owns the accessible name. */
export function LibraryIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path fill="currentColor" d="M3 2.5h4.2l1 1.2H13a1 1 0 0 1 1 1V12a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V4a1.5 1.5 0 0 1 1.5-1.5Z" />
  </svg>
}
