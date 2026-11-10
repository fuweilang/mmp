# Library tree and inline preview implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display personal and enterprise files in independent left trees and format-aware previews in the right pane.

**Architecture:** Library owns authorized version loading and selection. The existing document-preview plugin supplies a root-scoped bytes Factory; the account Host converts authorized Office versions using the existing OfficeToPdf provider.

**Tech Stack:** React, Cordis slots/Factories, PDF.js, FortuneSheet, existing LibreOffice kit, Vitest and browser acceptance.

**Spec:** `docs/superpowers/specs/2026-11-09-library-tree-inline-preview.md` (user approved direct implementation).

## Global Constraints

- Preserve current uncommitted work on `codex/library-chat-attachments-20261109`, including sidebar resize changes. Do not replace the checkout with a clean HEAD or commit unrelated changes.
- No production deployment or installed desktop replacement.
- No direct cross-feature runtime imports, no synthetic Session/tab, no file copy to a Session to bypass authorization.
- Ordinary authenticated downloads supply complete bytes; keep inline=1 media policy unchanged.
- Localized UI; independent root collapse state; right pane contains no directory table or preview modal.

## Review Focus

- Delayed content or failure from file A must not replace file B or another category.
- Shared trees must retain shared filtering at every depth and never expand access.
- Unknown binary formats and conversion failures must show a truthful explanation and download action.
- Closing/unmounting/switching must dispose byte, blob, PDF worker and conversion lifetimes.
- Existing upload targets, management actions, history reference opening and sidebar resize must remain usable.

### Task 1: Reusable formatted byte preview

**Files:** `mammoth-agent/packages/client/ui-sidebar-documentpreview/src/client/bytes/*`, existing PDF/Excel internals, package README and focused tests.

**Interfaces:** Produces root Factory `document.preview.bytes` with owner `{ name: string; bytes: Uint8Array<ArrayBuffer>; mimeType: string; missingFonts?: readonly string[] }`. Factory declaration travels via type-only import of the preview package client entry. Main plugin registers it. No tab/Session input.

- [x] Write and run failing tests for actual Markdown structure, PDF byte handling/lifetime and workbook data/format routing. Preserve existing PDF/Excel behavior tests.
- [x] Refactor PDF into a pure byte reader with externally supplied view/lifetime, keeping the existing tab wrapper; narrow Excel rendering props to data actually used. Register lazy standalone Factory using those implementations and existing localized dictionaries/limits.
- [x] Support Markdown, text/code, PDF, sheets, image and supported audio/video; Office PDF responses use application/pdf despite original name. Explain unsupported formats and missing fonts without rendering binary as text.
- [x] Run focused new and existing preview tests; report exact results and integration details. Do not commit shared work.

### Task 2: Account-bound Office rendering and binary reads

**Files:** `mammoth-agent/packages/credentials/deepseek-account-platform/src/ground-library*.ts`, corresponding tests, manifest/config declarations if needed; `mammoth-agent/packages/client/ui-enterprise-library/src/client/api.ts` and API tests.

**Interfaces:** Host GET `/ground-library/nodes/:nodeId/render?versionId=:versionId&extension=:ext` supports doc/docx/ppt/pptx only. Authorize exact source using captured account token and existing Ground version preview/download; never trust extension for permissions. Return full PDF `content-type: application/pdf`, `cache-control: no-store`, and URI-encoded JSON string array `x-mmp-missing-fonts`. Missing service/unsupported/refused results are actionable non-2xx. Abort conversion when request ends and check captured token again before delivery.

Produces browser `fetchLibraryPreviewBytes(origin: string, nodeId: string, versionId: string, name: string, fetchImpl: LibraryFetch, signal?: AbortSignal): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string; missingFonts: readonly string[] }>`; Office uses render endpoint, other files use ordinary download. Read complete data, reject non-2xx, validate PDF response for conversion, retain version/abort identity. Existing API signatures stay compatible.

- [x] Write and run failing HTTP tests for unauthorized connection, private/shared authorization refusal, missing version, switched account during source read/conversion, unsupported extensions and valid PDF output.
- [x] Implement route/provider integration with existing admission-controlled OfficeToPdf source.read, source version/key identity and disposal. Keep token private and never forward render as a Ground API operation.
- [x] Write failing browser read tests then implement binary fetching, cancellation and conversion response handling.
- [x] Run focused transport/API/conversion tests and report results. Do not edit LibraryPanel/LibraryTree or preview package; do not commit shared work.

### Task 3: Dual trees and fixed preview pane

**Files:** `mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryPanel.tsx`, `LibraryTree.tsx`, related CSS/locales/index metadata, README and panel/tree tests.

**Interfaces:** Consumes Task 1 Factory and Task 2 fetch helper. Tree gains explicit `view: 'mine' | 'shared'`, optional query/status and row accessory callback as needed, propagating category and selected parent for management. Panel owns immutable selected item/version, request AbortController/generation and loaded bytes.

- [x] Write failing interaction tests: independent personal/shared trees, same-category recursive queries, repeated root toggling, right-pane preview without table/modal and stale success/failure cancellation.
- [x] Move listing/search/management to left navigation; retain parent path/scope as upload target. Keep recent/trash controls on left. Folder-title navigation expands folder, never renders directory on right.
- [x] Mount byte Factory inside right preview region; preserve file name/type/version/actions, readiness semantics and reference requests. No fake framework hooks or Session creation.
- [x] Update obsolete table/modal-specific tests to assert intended behavior; retain scope-change, upload, actions, pagination, version/reference and resize coverage.
- [x] Run package tests and preserve existing unrelated edits.

### Task 4: Integrate and accept

**Files:** focused browser acceptance test/fixtures and task report under docs/superpowers/reports.

- [x] Run combined relevant tests and complete artifact/type build; fix introduced failures and report pre-existing failures.
- [x] Use actual small Markdown/PDF/Word/Excel/PPT/image files through the real shared UI, verify visible structure/pages/sheet/style plus left navigation and no modal. Test narrow viewport and both themes.
- [x] Request an independent whole-change review; fix concrete issues, rerun affected checks, and record implementation/verification/limitations without claiming deployment.
