import { jsx as _jsx } from "react/jsx-runtime";
/** Object URLs belong to the mounted image/player and leave on replacement. */
import { useEffect, useState } from 'react';
import { ZoomViewport, zoomSurfaceClass } from "../zoom/ZoomViewport.js";
import { LoadingIndicator } from "../LoadingIndicator.js";
import css from './BytesPreview.module.css';
const scrollportRef = () => { };
/** @param props - admitted image or media bytes and localized failure controls. @returns an image viewport or native player. */
export function BytesMedia(props) {
    const { bytes, mimeType, kind, name, tImage, t } = props;
    const [source, setSource] = useState();
    const [failure, setFailure] = useState();
    useEffect(() => {
        const lifetime = new AbortController();
        let url;
        try {
            url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
        }
        catch {
            setSource({ bytes, mimeType, signal: lifetime.signal });
            return () => { lifetime.abort(); };
        }
        setSource({ bytes, mimeType, url, signal: lifetime.signal });
        return () => { lifetime.abort(); URL.revokeObjectURL(url); };
    }, [bytes, mimeType]);
    if (source?.bytes !== bytes || source.mimeType !== mimeType)
        return _jsx(LoadingIndicator, { label: t('loading') });
    if (source.url === undefined || failure === source.url)
        return _jsx("p", { role: "alert", children: kind === 'image' ? tImage('failed') : t('unsupportedFile') });
    const failed = () => { setFailure(source.url); };
    if (kind === 'image')
        return _jsx(Image, { url: source.url, name: name, tImage: tImage, signal: source.signal, onError: failed }, source.url);
    return kind === 'audio'
        ? _jsx("audio", { className: css.media, controls: true, src: source.url, "aria-label": name, onError: failed })
        : _jsx("video", { className: css.media, controls: true, src: source.url, "aria-label": name, onError: failed });
}
function Image({ url, name, tImage: t, onError, signal }) {
    const [preference, setPreference] = useState({ kind: 'fit-width' });
    const [width, setWidth] = useState();
    const labels = {
        controls: t('zoomControls'), menu: t('zoomMenu'), out: t('zoomOut'), into: t('zoomIn'),
        fitWidth: t('zoomFitWidth'), value: percent => t('zoomValue', { percent }),
    };
    return _jsx(ZoomViewport, { preference: preference, intrinsicWidth: width, labels: labels, signal: signal, scrollportRef: scrollportRef, onPreference: setPreference, children: _jsx("div", { className: `${css.image} ${zoomSurfaceClass}`, "data-document-zoom-surface": true, style: { '--document-zoom-width': `${width ?? 0}px` }, children: _jsx("img", { src: url, alt: name, onLoad: event => { setWidth(event.currentTarget.naturalWidth); }, onError: onError }) }) });
}
//# sourceMappingURL=BytesMedia.js.map