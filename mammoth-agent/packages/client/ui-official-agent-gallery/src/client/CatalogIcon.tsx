import { useEffect, useState, type ReactNode } from 'react';
import css from './GalleryPage.module.css';

/**
 * Local, controlled artwork.
 * - With a loadable `src`: show only the image (never stack the default SVG underneath —
 *   transparent logos must not reveal the glyph).
 * - No `src`, or load failure: show the kind glyph once; URL changes clear the failed state.
 */
export function CatalogIcon({ catalogKey, kind, src }: {
    readonly catalogKey: string;
    readonly kind: string;
    readonly src?: string | null | undefined;
}): ReactNode {
    const [failed, setFailed] = useState<string | null>(null);
    const tone = Array.from(catalogKey).reduce((hash, c) => ((hash * 31 + c.charCodeAt(0)) >>> 0), 0) % 4;
    const paths: Record<string, ReactNode> = {
        code: <><path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/></>,
        file: <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M8 12h8M8 16h6"/></>,
        chart: <><path d="M4 4v16h16M8 16v-5m4 5V7m4 9v-7"/></>,
        search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
        design: <><path d="m15 3 6 6-10 10-7 1 1-7zM12 6l6 6M4 20l5-5"/></>,
        write: <><path d="M4 20h16M5 15l10-11 5 5L9 19H5zM13 6l5 5"/></>,
        video: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></>,
        plan: <><rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 3v3m6-3v3M8 11l1 1 2-2m2 1h3m-8 6 1 1 2-2m2 1h3"/></>,
        case: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12c6 4 12 4 18 0M12 12v4"/></>,
        people: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4v2"/></>,
        scales: <><path d="M12 3v18M5 21h14M4 7h16M6 7l-4 8h8zm12 0-4 8h8z"/></>,
    };
    const imageSrc = typeof src === 'string' && src.trim() ? src.trim() : '';
    const showImage = Boolean(imageSrc && failed !== imageSrc);

    useEffect(() => {
        // New URL must not inherit a previous failure for a different src.
        setFailed(null);
    }, [imageSrc]);

    return (
      <span
        className={css.artwork}
        data-tone={tone}
        data-has-image={showImage ? 'true' : undefined}
        aria-hidden="true"
      >
        {showImage ? (
          <img
            src={imageSrc}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(imageSrc)}
          />
        ) : (
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {paths[kind] ?? paths.plan}
          </svg>
        )}
      </span>
    );
}
