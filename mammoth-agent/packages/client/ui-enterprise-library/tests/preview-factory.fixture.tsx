import type { PropsRenderFactories } from '@mammoth-ai/mmp-client-ui-slots'
import type { BytesPreviewOwner } from '../../ui-sidebar-documentpreview/src/client/bytes/contract.ts'
import { BytesPreview } from '../../ui-sidebar-documentpreview/src/client/bytes/BytesPreview.tsx'
import { bytesPreviewProps } from '../../ui-sidebar-documentpreview/tests/bytes-fixtures.client.ts'

/** Use the actual byte renderer for owner-local panel tests without a shell or Session. */
export const renderPreviewFactory: PropsRenderFactories['renderFactorySlot'] = (name, owner) => {
  if (name !== 'document.preview.bytes') throw new Error(`Unexpected factory ${name}`)
  return <BytesPreview {...bytesPreviewProps('', '')} {...owner as BytesPreviewOwner} />
}
