import type { ExcelFormat } from '../excel/format.ts';
/** Supported standalone presentations; HTML is static and unknown binaries are never decoded. */
export type BytesFormat = {
    readonly kind: 'pdf' | 'markdown' | 'text' | 'code' | 'html' | 'unsupported';
} | {
    readonly kind: 'excel';
    readonly format: ExcelFormat;
} | {
    readonly kind: 'image' | 'audio' | 'video';
    readonly mimeType: string;
};
/** @param name - original filename. @param mimeType - actual response MIME. @returns admitted renderer and parser/MIME metadata. */
export declare function bytesFormat(name: string, mimeType: string): BytesFormat;
//# sourceMappingURL=format.d.ts.map