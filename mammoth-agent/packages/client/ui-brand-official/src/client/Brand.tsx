import { BrandWordmark, FishLogo } from '@mammoth-ai/mmp-client-ui-primitives'
import type { SidebarBrandMarkOwnerProps } from '@mammoth-ai/mmp-client-ui-sidebar/client'

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the official mammoth mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <FishLogo size={size} />
}

/**
 * Render the official name artwork without its independently slotted mark.
 * @returns the 猛犸AI wordmark.
 */
export function OfficialBrandName() {
  return <BrandWordmark includeMark={false} />
}
