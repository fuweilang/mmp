# Library chat attachments implementation plan

> **For agentic workers:** Use the approved spec and scoped parallel tasks below; preserve all pre-existing working-tree changes. Do not commit, stage, push, deploy or replace the installed app.

**Goal:** Ship the dedicated library picker and durable file-card history together, retaining authorized model access and retry/replay behavior.

**Architecture:** The composer sends structured library references alongside the user's text. Host admission resolves each selected version through the authenticated Ground API and stores a separate text block containing the exact model excerpt plus typed library reference metadata. Existing text adapters continue to receive the excerpt; user-facing projections render the metadata as file cards and display only the user's own text. This keeps model-visible material in the log without a new block discriminator or an unlogged context injection.

**Tech stack:** Existing Cordis, TypeScript, React, CSS Modules, Modal and typed locale primitives; Vitest/jsdom and repository builds.

**Spec:** ../specs/2026-11-09-library-chat-attachment-proposal.md

## Global constraints

- Preserve existing dirty files (Ground sharing/permissions and library panel work).
- Work on `codex/library-chat-attachments-20261109`; no commits/push/release.
- Plain user text is never replaced by source body; source text is a separate durable block with `reference` metadata.
- Authorize selected node/version in the Host at submission using existing Ground credentials; browser labels are display-only.
- Follow existing slots/store/inject and localization rules; no feature-package runtime imports.
- Keep model snapshot semantics, real locators and truncation flags; never claim full-file reading for an excerpt.
- Optional text metadata must survive admission/codec/replay; document and acknowledge persistence compatibility.

## Review focus

- Long names and disabled records must fit; unavailable reason appears once.
- Selection survives search/page/tab changes; cancel never changes draft and confirm targets captured session.
- Account switching or source permission failure rejects the entire submission without clearing the draft.
- Source excerpts stay model-visible after replay while UI/copy/export remain file references plus user text.
- Ordinary files, images, other reference sources, queues and plain-text prompts retain current behavior.

### Task 1: Dedicated library picker

**Files:** New `ui-enterprise-library/src/client/LibraryPicker.tsx`, CSS, tests; append existing locales.

**Interfaces:** Component receives locale seat and `{origin, fetchImpl, open, initialSelected?, onClose, onConfirm(items)}`; `items` are existing `LibraryChoice` values. Root owns registration and captured session.

- [x] Write and run failing UI tests for selection/cancel/confirm, navigation, paging, search, stale responses, blocked records.
- [x] Implement 800×640 viewport-clamped Modal, recent/mine/shared tabs, folders/breadcrumbs, 48px rows, icons, selected count, loading/retry.
- [x] Run focused picker tests and report interface to integrator.

### Task 2: Host-authorized persistent references

**Files:** Attachment types/admission, LLM TextBlock, Session prompt API types/commands, account Ground prompt resolver, focused tests and persistence records.

**Interfaces:** `LibrarySourceReference = {source:'library',nodeId,versionId,name,versionNo?,bytes?}`; `TextBlock.reference?: LibrarySourceReference`. Wire `PromptContentPart` adds `{type:'library',nodeId,versionId,name}`. Source name is Host-authoritative on accepted messages. API serial event `session/resolve-library-reference` resolves the reference to `TextBlock` through account provider or rejects unsupported handling.

- [x] Write failing tests proving metadata survives Host admission/replay and source errors reject before queue admission.
- [x] Resolve all library wire parts against authenticated `/api/library/open` with `purpose:'prepare'`; preserve captured-account race checks and exact requested version.
- [x] Persist separate source text blocks with metadata, unchanged model excerpt and real locator.
- [x] Run targeted admission, account and format tests.
- [ ] Record optional-field compatibility through persistence tooling. The attempt is blocked by the unchanged historical V4 schema digest; evidence and unrecorded compatibility prose are linked in the verification report.

### Task 3: Message cards and user-facing projections

**Files:** ui-chat content preparation/rendering, library reference opening service, queue/clipboard/transcript projection and tests.

**Interfaces:** Consume `TextBlock.reference`, render file cards using saved names and identities, omit source blocks from visible/copy text. Root supplies pending submission refs and generic open callback through service/slot.

- [x] Add failing rendering/copy/export tests with a unique hidden excerpt and two references.
- [x] Reuse attachment card appearance; provide authorized version-open callback through injected service, preserve ordinary attachment paths.
- [x] Handle legacy text conservatively; do not guess-remove ambiguous old prompt text.
- [x] Run ui-chat and transcript focused tests.

### Task 4: Composer integration and end-to-end verification

**Files:** ui-input-trigger codec declarations/controller, ui-conversation prompt/facade/hub/service/pending echo, library plugin assembly, tests and README.

**Interfaces:** Reference codec may return string or library wire part. `serializeDraftPrompt` preserves ordinary string behavior and returns ordered blocks for structured references. Submission carries separate display text and library refs while Host receives full ordered parts.

- [x] Write failing tests for mixed text/library/ordinary references, repeat references, rejection/retry, quotes and empty/plain prompts.
- [x] Integrate picker in declared shell overlay, capture target session and initialize current library selections; confirm only attaches references.
- [x] Propagate ordered prompt parts and pending file-card metadata; preserve accepted-only draft clearing and queue/steer semantics.
- [x] Run combined focused tests, latest build:artifacts then build:check, relevant localization/style/dependency/persistence checks.
- [x] Perform independent review and correct concrete issues; report real UI/API scenarios still unverified.

## Verification record

See ../reports/2026-11-09-library-chat-attachments.md for commands, actual results, browser acceptance, legacy-history limits and the pre-existing persistence acknowledgement blocker. No commits or deployment were performed.
