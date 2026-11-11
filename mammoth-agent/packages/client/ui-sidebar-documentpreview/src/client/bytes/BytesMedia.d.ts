/** Object URLs belong to the mounted image/player and leave on replacement. */
import { type ReactNode } from 'react';
import type { BytesPreviewProps } from './contract.ts';
type Props = Pick<BytesPreviewProps, 'name' | 'bytes' | 'mimeType' | 'tImage' | 't'> & {
    readonly kind: 'image' | 'audio' | 'video';
};
/** @param props - admitted image or media bytes and localized failure controls. @returns an image viewport or native player. */
export declare function BytesMedia(props: Props): ReactNode;
export {};
//# sourceMappingURL=BytesMedia.d.ts.map