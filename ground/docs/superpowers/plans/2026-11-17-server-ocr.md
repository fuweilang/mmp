# Server OCR Implementation Plan

**Goal:** Replace the knowledge-core macOS OCR dependency with the existing configured vision models, supporting scanned PDFs and static images, verified only locally.

**Architecture:** A server OCR service resolves enabled vision models through existing model/provider configuration, pins the model ID in immutable index configuration, validates image pixels, and transcribes via bounded OpenAI-compatible requests. PDF pages and image tiles share this service. Successful transcription is cached privately by image bytes, model route and prompt version, so preview and ingestion use the same extraction. Partial or truncated output never promotes an index to READY. Existing text extraction and expert-side retrieval remain in place.

**Constraints:** No publication, push or production data writes. Use the existing isolated localhost:15541 database. No new credentials. Keep the seven unrelated frontend files untouched. No native macOS calls on the knowledge OCR path. Preserve physical page/source metadata, safe errors, cancellation, old successful index retention and access checks.

- [x] Add failing tests for server model resolution, static-image validation, bounded requests, output/partial/truncation validation, caching, cancellation, and image/PDF preparation.
- [x] Implement vision OCR adapter and cache; wire preview, upload and worker; pin OCR model identity in configuration and bump parser version.
- [x] Add PNG/JPEG/WebP/GIF uploads, image OCR defaults and format-specific UI; verify upload/replace/processing behavior.
- [x] Run backend/frontend targeted tests and source typechecks; build to isolated output without clearing live dist.
- [x] Run real OCR PDF and image through local durable queue, PostgreSQL vectors, expert binding and runtime retrieval; verify citations and negative cases.
- [x] Verify Linux runtime without macOS OCR, review changes and record evidence. Leave everything local and unpublished.

Validation evidence: /Users/luoxiaojun/Documents/mmp/outputs/kb-server-ocr-20261117/verification-summary.json. Linux arm64 OCR and durable ingestion verified; three source documents and six runtime recall queries passed again after the final changes. No publication.
