# Automatic scanned PDF OCR

PDF uploads default to an immutable auto-parse configuration. The same background job extracts native text per page and recognizes nonblank raster pages without entering a failed state between detection and OCR. Blank pages are skipped, real OCR failures remain visible, and per-page checkpoints retain whether native extraction or OCR produced each page. Existing text-only and forced OCR options remain available. Model routes are pinned when available; ordinary text PDFs remain usable without an OCR provider. Preserve the five-page batch, lease/restart behavior, current source positions and old successful index until complete promotion.

- [x] Add tests for scan auto-detection, native PDFs without an OCR model, mixed/blank pages and genuine failures.
- [x] Wire auto defaults through upload, context, preview, checkpointed worker and UI with an honest in-progress state.
- [x] Validate automatic upload through Linux worker, actual database vectors and expert recall, with no manual OCR reindex step.
- [x] Verify source builds, review and local UI. No publication or production writes.
