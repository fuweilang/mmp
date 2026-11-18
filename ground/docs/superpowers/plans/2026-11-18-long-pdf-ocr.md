# Long scanned PDF OCR implementation plan

**Goal:** Support scans with hundreds of pages through resumable, bounded background OCR and real expert recall, locally only.

**Architecture:** Process five pages per durable queue claim, persist immutable per-page results in private shared knowledge storage, then yield the job without consuming failure attempts. Each claim opens/closes its own PDF renderer and has a bounded time budget. Reconstruct canonical text by physical page only after all pages are complete, then embed and atomically activate the new index. Long-document HTTP previews show a clearly labelled three-page sample; full processing runs through the existing durable worker. Progress reads expose only counts and page numbers after current access checks. No schema migration is necessary.

**Constraints:** No publication or push. All acceptance writes use the localhost:15541 isolated database and Linux worker. Preserve seven unrelated frontend files. Keep single-page pixel and model-call limits; remove whole-document accumulated raster caps. Pin route identity, fence claims/cancellation, retain old successful indexes, and never report partial extraction as READY. PDFs up to 100 MiB and 2000 pages; other document and image limits unchanged. Extraction text/token caps remain explicit, without silent truncation.

- [x] Add failing tests for 120-page scans, samples, batch yield, restart/resume, page failures/blank pages, bounded rendering and physical page preservation.
- [x] Add private page checkpoint/progress storage and leased queue yielding; version index identity and integrate background extraction.
- [x] Add labelled sample preview and background submit behavior, document progress and retry, and PDF-specific upload limits.
- [x] Run targeted backend/frontend tests and isolated builds; review fault, cancellation and cross-process recovery paths.
- [x] Generate a 120-page scan with distinct beginning/middle/end facts, process it through Linux worker and real database vectors, bind an unpublished expert and verify actual recall/citations. Exercise interruption/restart and record evidence.

Acceptance: generated 120-page image-only PDF (three distinct sentinel pages and 117 repeated appendix pages), 25 Linux claims across two worker runs, forced SIGKILL at ten completed pages followed by natural lease-expiry recovery, 120 stored chunks/vectors, six expert recall queries and six reopened source citations on physical pages 1/60/120. Old successful index remained effective until full promotion. Evidence: /Users/luoxiaojun/Documents/mmp/outputs/kb-long-pdf-20261118/. Existing DB stage CHECK was verified; processing uses PARSING without a migration. Parallel workspace updates were preserved. No publication.
