import type { PropsRenderSlots } from '@mammoth-ai/mmp-client-ui-slots'
import { AppFrame, type AppFrameProps } from './AppFrame.tsx'

/** A dedicated presentation may omit the shell while preserving its extension seats. */
export function RootFrame(props: AppFrameProps & PropsRenderSlots<'rootframe'>) {
  return props.renderSlot('rootframe', {}, { fallback: <AppFrame {...props} /> })
}
