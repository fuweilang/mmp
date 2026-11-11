/** PDF instance viewing state and cancellation owned by one standalone body. */
import { type ReactNode } from 'react';
import type { BytesPreviewProps } from './contract.ts';
/** @param props - borrowed PDF data and localized controls. @returns standalone reader without synthetic framework seats. */
export declare function BytesPdf({ bytes, tPdf }: Pick<BytesPreviewProps, 'bytes' | 'tPdf'>): ReactNode;
//# sourceMappingURL=BytesPdf.d.ts.map