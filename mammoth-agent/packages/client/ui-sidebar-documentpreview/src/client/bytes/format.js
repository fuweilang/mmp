/** Byte preview admission before decoding or creating an object URL. */
import { CODE_HIGHLIGHT_EXTENSIONS } from '@mammoth-ai/mmp-client-ui-primitives';
const MEDIA = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml', avif: 'image/avif',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
};
/** @param name - original filename. @param mimeType - actual response MIME. @returns admitted renderer and parser/MIME metadata. */
export function bytesFormat(name, mimeType) {
    const mime = mimeType.split(';')[0].trim().toLowerCase();
    const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    if (mime === 'application/pdf' || extension === 'pdf')
        return { kind: 'pdf' };
    if (extension === 'xlsx' || extension === 'xls' || extension === 'csv' || extension === 'tsv')
        return { kind: 'excel', format: extension };
    const media = MEDIA[extension];
    if (media !== undefined)
        return { kind: media.startsWith('image/') ? 'image' : media.startsWith('audio/') ? 'audio' : 'video', mimeType: media };
    if (extension === 'md' || extension === 'markdown' || mime === 'text/markdown')
        return { kind: 'markdown' };
    if (extension === 'html' || extension === 'htm' || mime === 'text/html')
        return { kind: 'html' };
    if (CODE_HIGHLIGHT_EXTENSIONS.includes(extension))
        return { kind: 'code' };
    if (['txt', 'log', 'text'].includes(extension) || mime.startsWith('text/') && mime !== 'text/html')
        return { kind: 'text' };
    return { kind: 'unsupported' };
}
//# sourceMappingURL=format.js.map