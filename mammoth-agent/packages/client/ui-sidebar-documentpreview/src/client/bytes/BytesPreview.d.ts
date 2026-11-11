/** Standalone format routing; heavyweight PDF and workbook engines remain lazy. */
import { type ReactNode } from 'react';
import type { BytesPreviewProps } from './contract.ts';
/**
 * Render complete, authorized bytes using package-owned format viewers.
 * @param props - filename, actual response MIME, borrowed bytes, limits, and localized copy.
 * @returns formatted document or a truthful unsupported state; never decodes unknown binary content.
 */
export declare function BytesPreview(props: BytesPreviewProps): ReactNode;
//# sourceMappingURL=BytesPreview.d.ts.map