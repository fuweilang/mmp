/** Client preflight only; the server independently validates every image again. */
export async function validateCatalogImage(file: File): Promise<void> {
    if (!file.size || file.size > 2 * 1024 * 1024)
        throw new Error('请选择不超过2MB的图片');
    const extension = file.name.toLowerCase().match(/\.(png|jpe?g|webp)$/)?.[1];
    const mime = file.type.toLowerCase();
    if (!extension || /[\\/\0]/.test(file.name) || !['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mime))
        throw new Error('仅支持PNG、JPG、WebP图片');
    const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const png = bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    const jpg = bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
    const webp = bytes.length >= 16 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    const kind = png ? 'png' : jpg ? 'jpeg' : webp ? 'webp' : null;
    const wanted = extension === 'jpg' || extension === 'jpeg' ? 'jpeg' : extension;
    if (!kind || kind !== wanted || (mime === 'image/jpg' ? 'image/jpeg' : mime) !== `image/${kind}`)
        throw new Error('文件内容、扩展名和图片类型不一致');
    const url = URL.createObjectURL(file);
    try {
        await new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => { if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 8192 || image.naturalHeight > 8192 || image.naturalWidth * image.naturalHeight > 16777216)
            reject(new Error('图片尺寸过大或无效，建议使用方形图标'));
        else
            resolve(); }; image.onerror = () => reject(new Error('无法解码图片，请重新选择')); image.src = url; });
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
