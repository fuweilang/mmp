# Knowledge document processing implementation plan

**Goal:** Implement the user's approved knowledge-library proposal through the requested Responses API workflow, verify locally and do not publish.

**Architecture:** Retain the existing PostgreSQL job queue, immutable document/index revisions, token-aware parser/chunker and expert preview. Place operational credentials behind model-management service settings and document preparation controls in a separate document dialog. Preview and ingestion use the same preparation functions; preview has no persistence or embedding calls.

**Spec:** Approved proposal and implementation instruction in this chat; research evidence under `/Users/luoxiaojun/Documents/mmp/outputs/kb-research-20261117/`.

**Constraints:** No publish, push, commit, production-data writes, database migrations, new paid providers, or changes to unrelated dirty expert-management files. Initial backend generated with the configured API script; after the helper/key disappeared, the user explicitly authorized current Codex to finish implementation and verification. Keep old default index hashes and existing source references valid. Text-only extraction remains default; real OCR is only offered where the existing native recognizer is available, otherwise explicitly unavailable.

**Workspace ruling:** Work in the current local feature branch 5.6 so the existing local 5201 preview remains reviewable. Existing dirty expert-management files are outside this change's allowlist and will be preserved. No worktree/branch switch or automatic commits.

## Review focus

- No credentials or upstream error bodies in preparation responses.
- Scope, deletion, privilege and enabled flags must be rechecked after slow parsing.
- Changed controls or a switched document must invalidate pending/old previews.
- Preview truncation or extraction failure must not be represented as ready for reprocessing.
- Reprocessing must preserve old successful indexes and must not change legacy config hashes.

## Tasks

1. Capture baseline and generate a reviewable API patch plus tests. Baseline: backend knowledge-core 37 passing, frontend knowledge-files 6 passing. API helper output/timeout limits may be temporarily raised with original bytes restored in finally; credentials remain script-owned.
2. Apply API-generated tests first and observe missing document processing behavior fail. Add local unit coverage for actual parsing/chunking/config validation and UI coverage for entry removal, preview/reprocess, invalidation and API errors.
3. Review and apply generated implementation: move service entry to model management, hide standalone retrieval testing on service page, add authorized processing context/preview and document dialog, support config-bearing reindex, integrate real optional OCR and preserve immutable identities.
4. Run targeted tests, frontend typecheck/build and backend build. Use local fixtures/mocked API and a genuinely isolated local database if DB integration is needed; current 5433 listener is SSH forwarded and must receive no validation writes. Verify 5201 UI read-only.
5. Obtain independent read-only code review, resolve material findings with the user-authorized current Codex workflow, rerun justified checks, and deliver local changed files, verification evidence, limitations and API model/request/token receipt.

## Status — complete locally, unpublished

- User authorized splitting the API work, then authorized current Codex to finish after the API helper/key disappeared. No secret backups were searched or restored.
- API generation 1 succeeded (gpt-5.4-2026-03-05, req_c6c1ed0f79f74123b75770b6a5c0b533, input92706/output13657). Correction 2 hit output24000 and was not applied. Backend call3 succeeded (req_641dc6b787174da18f6f3a575e4bd9ba, input28275/output12601); API artifacts retained under outputs/kb-development-20261117.
- Applied/repaired backend shared document preparation, actual optional local PDF OCR, privileged context/preview APIs, immutable configuration support and ingestion reuse. Legacy text hashes preserved.
- Completed frontend document processing dialog with Token controls, actual preview APIs, pagination, stale/aborted request invalidation and stable idempotent queue retry. Removed advanced settings from folder list, moved service settings to model management and retained retrieval debugging in expert configuration.
- Independent read-only review found a cancellation propagation gap. Added controller/inspection/native-OCR cancellation and cleanup; observed 11pass+2fail before correction, then13pass. Reviewer rechecked the fix and reported no blockers.
- Final backend tests: core50 + retrieval18 =68 passed. Includes actual native PDF rasterization/OCR on this Mac, permission revocation, config identity, shared worker chunks, old READY retention, and cancellation/cleanup.
- Frontend full suite:36 unit +131 UI passed with NODE_OPTIONS=--no-experimental-webstorage; final scoped KB rerun21 tests. vue-tsc and complete pnpm build passed. Default Node26 experimental WebStorage causes unrelated baseline UI localStorage failures without the flag; no app/session configuration was changed for this.
- Browser inspected actual components with isolated sample API responses: folder list has no advanced button; document processing controls, previewed source/chunks and gated reprocess action render correctly. Screenshot outputs/kb-development-20261117/processing-preview.jpg. Temporary HTML entry removed from frontend source; copy retained only in outputs.
- No writes against SSH-forwarded DB5433, no DB migrations or actual database reprocessing acceptance. Reindex/worker behavior verified with in-memory adapters. No deployment, commit or push.
- All7 pre-existing expert-management file hashes verified unchanged. git diff --check passed.
- OCR scope: local macOS recognizer only; unavailable hosts show disabled capability. Scanned PDF OCR is limited to10pages, per-page/cumulative rendering limits and bounded recognition time/output; partial extraction cannot be submitted from the processing dialog.
