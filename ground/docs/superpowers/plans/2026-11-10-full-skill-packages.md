# Full skill packages implementation plan

> Execute inline with superpowers:executing-plans. The user approved the design and requested execution; no additional plan approval is required. Do not commit, push, merge or deploy.

**Goal:** Preserve, distribute and actually use a complete single skill package with scripts, references and assets.

**Architecture:** Ground owns immutable revision files and their index. A negotiated v2 content response describes every file. The existing scoped skill Provider prepares verified execution copies inside the selected workspace and the existing standard tools read and execute them.

**Tech Stack:** Vue 3, NestJS, Prisma/PostgreSQL, yauzl/YAML, TypeScript/Node, Cordis Harness.

**Spec:** ../specs/2026-11-10-full-skill-packages-design.md (approved in chat).

## Global constraints

- ZIP 12MiB, expanded package 10MiB, SKILL.md 100KiB, 500 files; include declared limits in v2 and validate local Host caps.
- Preserve original bytes and relative paths, including upstream skill.json and package.zip. Separate archive and expanded storage.
- No new execution authority, automatic dependency installation, production deployment or Session-format changes.
- Legacy package reads remain supported; old readers must explicitly fail on v2, never load a partial package.
- Work only in this worktree; unrelated original checkout edits remain untouched.

## Review focus

- ZIP raw names, normalized collisions, links and file/directory conflicts: Task 1 rejects before publishing.
- Upstream skill.json and metadata edits: Tasks 1/2 keep original bytes and hashes stable.
- Legacy strict responses and pinned revisions: Task 2 tests both response formats and old-reader rejection.
- Sandbox visibility, mutable execution copies, cancellation and auth turnover: Tasks 3/5 exercise resource paths, renewal and cleanup.
- Files accepted at upload but rejected later: Tasks 1/3 share a literal v2 fixture and verify byte/count/manifest limits and digests.

## Task 1: Package parser and persistence

**Files:** Ground `official-skill/skill-package.ts`; new `skill-package-format.ts`; `test/official-skill/skill-package-import.unit.test.ts`; new complete-package tests; backend package.json/lockfile for an explicit maintained YAML dependency.

**Interfaces:** `SkillPackageFile {path,bytes,sha256,executable}`; `SkillPackageLimits {maxFiles,maxTotalBytes,maxInstructionBytes}`; manifest gains optional `packageFormat:2`, `files`, `packageDigest`, `limits`. Digest is SHA256 of JSON.stringify(sorted file tuples `[path,bytes,sha256,executable]`), sorting by code-unit path ordering. `ParsedSkillPackage.files` is exact imported content for v2. Preview adds total/script/reference/asset counts and expanded bytes.

- [x] Add tests for complete binary/script packages, multiline YAML, native/foreign manifests, nested entry resolution, >1MiB asset, executable flags, archive-name collision, raw unsafe/duplicate/case-conflicting paths, links and limits; observe missing behavior failures.
- [x] Implement bounded extraction, strict portable paths, metadata parsing, complete index and archive/content separation. New ZIP and form packages use v2; retarget changes index only.
- [x] Update obsolete expectations for generated skill.json and execute-binary rejection; they are intentional format behavior changes.
- [x] Run `node --import tsx --test test/official-skill/*.test.ts` from backend. Record output.

## Task 2: Authenticated revision resource API

**Files:** Ground official-skill service/controller/DTO, admin controller upload bound; new service resource tests.

**Interfaces:** `/content?revision=N&packageFormat=2` returns legacy payload for legacy packages, v2 payload `{...identity,instruction,packageFormat:2,files,packageDigest,limits}` for v2. No parameter on v2 returns `SKILL_CLIENT_UPGRADE_REQUIRED`. `/resources` authorizes exact declared paths against the same revision and emits octet-stream attachments/nosniff. Metadata-only changes never rewrite v2 files.

- [x] Write behavioral tests for legacy/v2 negotiation, pinned versions, arbitrary declared resources and forbidden undeclared/unsafe paths; observe failures.
- [x] Implement responses, metadata guard and headers while retaining current enable/deletion/history rules.
- [x] Run new resource tests plus package/workflow tests; backend `pnpm build`.

## Task 3: Host protocol and workspace preparation

**Files:** Harness official-agent-gallery `ground.ts`, `skill-provider.ts`, `index.ts`, new `skill-package.ts`; tests `ground.spec.ts`, new package/provider tests.

**Interfaces:** discriminated legacy/v2 content schema; bounded resource fetch accepts explicit byte bound. Prepared package cache key includes workspace and revision/digest. Verify complete index, SKILL bytes and each file; validate every source file before reuse; recreate modified copies. New directories live under real workspace `.mmp/runtime/skill-packages/`, reject symlink ancestors. Provider owns all allocated directories through cleanup and cancellation. Preserve executable bit in owner-only file modes. Consumers derive paths from the matching content variant.

- [x] Add keyless tests against real files for v2 download, binary integrity, execution modes, repeated loads, cache mutation, workspace separation, missing/extra/bad files, corruption, stream bounds, cancellation and disposal; observe failures.
- [x] Implement protocol, bounded streaming, verified preparation and scoped lifecycle. Keep standard tool policies unchanged.
- [x] Run focused gallery tests. Record and separately resolve/report any pre-existing baseline issue that blocks the changed surface.

## Task 4: Upload preview

**Files:** Ground admin API types and AdminOfficialSkills.vue; owning frontend validation tests or existing frontend checks.

- [x] Update types (existing frontend has no dedicated preview behavior test; verify with typecheck/build) for file/script/reference/asset counts and expanded bytes.
- [x] Display meaningful package contents in existing upload/edit dialog without introducing a new flow.
- [x] Run frontend typecheck/build and relevant tests.

## Task 5: Real execution, documentation and review

**Files:** Harness native-standard/Loader composition tests and recorded output; small synthetic ZIP fixture; owning README files and Ground complete-package documentation.

- [x] Add a complete-package case to real Loader/native tool composition: `skill` loads, file tool reads references, Bash executes dependency-free Node/Python/Shell scripts against assets, and writes literal expected result into workspace. HTTP/model remain explicitly synthetic; command/file execution is real.
- [x] Cover failure for a deliberately absent dependency, legacy/new revision separation, resource-folder sandbox visibility and lifecycle cleanup. Record platform-specific gaps instead of claiming unsupported-platform acceptance.
- [x] Document v2 protocol, limits and execution behavior in owner docs. Update plan/ledger with actual evidence.
- [x] Run Ground backend/frontend build, focused Harness suites, required artifacts then build:check. Run one fresh independent review of the final uncommitted diff; fix important findings with reproducing tests.
- [x] Deliver paths, actual evidence, baseline failures and remaining live-UI/cloud/platform limits. No unsolicited integration, commit or release.

## Execution ledger

- Setup: native managed worktree `/Users/luoxiaojun/.codex/worktrees/full-skill-packages/mmp`, detached HEAD; original checkout on `4.0` preserved. Offline dependency installation completed in both projects.
- Baseline Ground: package import + workflow, 11 passed / 0 failed.
- Baseline Harness: ground.spec 4 passed / 1 failed (`cancels an error response body without leaking its contents`); native-standard could not resolve unbuilt Cordis exports. Preparing artifacts before retrying native coverage.
- Ruling: user authorization to execute the approved design supersedes skill prompts to ask again about plan/execution method. Work is inline, with independent final review. Repository instructions prohibit unsolicited commits, so completion is tracked by tests/diff rather than per-task commits.

- Tasks 1/2: complete — new parser tests RED 7/7 then GREEN; resource API tests RED 3/3 then GREEN; combined `node --import tsx --test test/official-skill/*.test.ts` 21 passed, backend `pnpm build` passed after shared package build. Source ZIP and expanded package.zip verified distinct.
- Ruling: use maintained yauzl 3.4.0 for bounded sequential ZIP entries instead of JSZip extraction, since JSZip normalizes traversal names and merges duplicates before admission. Existing JSZip remains for other consumers/test ZIP creation; YAML parser is explicit yaml 2.9.0 dependency.
- Task 3: focused Host suites currently 16 passed (full-package, Ground, native-standard); package TypeScript project build passed. The old error-body cleanup test now passes with bounded body reading and cancellation on the changed HTTP surface.

- Broad gallery comparison: original checkout 43 tests, 24 failures; worktree 52 tests, 23 failures. Failure-name comparison: no newly failing cases; the old Ground error-body cleanup case is resolved. Remaining failures are pre-existing legacy expert/managed-profile/bundle assertions and are outside full-package behavior. See baseline report for names.

- Final acceptance: Ground package/resource/workflow suites **25 passed / 0 failed**; Ground full backend+frontend build passed. Upload preview verified by frontend typecheck/build; live page clicking is outstanding.
- Final focused Host verification: four files selected by behavior, **23 passed / 16 unrelated skipped**; built-artifact native Loader execution **6 passed / 0 failed**. Node/Python/Shell and filesystem are real; Ground HTTP/model are scripted fixtures. Evidence includes source-backed tool-result snapshot and actual output values.
- Final broad gallery: **56 total, 33 passed, 23 failed**; exact failure-name comparison against original: **0 new failures**, Ground bounded-error-body case resolved. Baseline JSON names every remaining failure.
- Required artifacts build: **8 gates passed / 0 failed**. Required build:check: **Host aggregate passed; Client aggregate failed on five pre-existing errors in ui-conversation/skill-chip and ui-official-agent-gallery gallery-page/starter-draft tests**. Error locations/codes all occur in the original-checkout check. No claim of a clean whole-repository gate.
- Independent review found five Important issues. Fixed path preservation, complete lookup lifecycle, first-prompt resource directory, serialized metadata envelope and idle sign-out cleanup with reproducing tests. Follow-up found overlapping invalidation; added double-invalidation RED→GREEN. Original uncooperative HTTP cancellation regression also passes after abort-aware lookup detachment. See evidence/review.md.
- Delivery: Chinese instructions identify each window and source owner in `../../full-skill-packages-acceptance.md`; demo ZIP is `../../../examples/skills/complete-package-demo.zip`. No live account upload/real DB/auth HTTP/cloud-model autonomy or Linux/Windows acceptance performed. No deployment, commit, push or merge. Original checkout's unrelated changes remain untouched.

- Subsequent user-requested adversarial testing (2026-11-10): 70 new cases, 67 passed / 3 failed; with 47 relevant regressions, 117 total / 114 passed / 3 failed. Confirmed new issues: ZIP CRC mismatch admitted, overlong filename passes preview but fails persistence, failed owner creation remains cached after ancestor repair. Product logic not changed in this testing turn; findings remain open. See `../../full-skill-packages-adversarial-test.md` and dedicated evidence directory. Host aggregate types passed; Client same five baseline errors. This supersedes any implication that the candidate has no remaining known defects.

- User-authorized remediation of all three adversarial findings: complete. ZIP entry CRC now verified using Node>=22.2.0; Ground/Host enforce per-component255 UTF-8 bytes within existing total512 UTF-16 units; failed directory reservations are removed only if still current. Regression tests observed RED before fixes. Final Ground68/68, Host focused60/60, built native6/6; artifacts8/8 and Ground full build passed. Host types passed; Client same five baseline errors. Broad gallery94 total71 passed23 baseline failures/no new failure names. Independent review found no Critical/Important/Minor issues. See `../../full-skill-packages-three-fixes.md`. No commit/push/merge/deploy.

- Real uploaded package validation: user supplied poster-design-studio0.2.4 ZIP, 91,935 bytes /22 files /4 scripts /14 references /0 assets. Real Ground parser, disk/archive preservation and fixed-revision resources verified all22 bytes/hashes. Real native Loader/fs/bash loaded it and ran unmodified Python CLI help and isolated missing-credential branch. Default Python3.9.6 fails at runtime type alias; existing3.12.14 passes, no global environment changes. Source focused61/61, built-native7/7; Host types pass, Client same five baseline errors. Real poster generation not performed: no Beatra credential or paid-call confirmation. See `../../poster-design-studio-024-test.md`. No product-code change or deployment.

- Follow-up explicit invocation test, preserving user choice no-login/no-charge: actual skill tool successfully invoked poster-design-studio and returned body/resource root. Bundled call_tool(beatra.images.generate) attempted locally using isolated absent credentials and prohibited external transport; raised CredentialsMissing before any remote request. Source and built native tests7/7 each; Host types passed, Client same five baseline errors. Remote generation remains unverified and not successful. See ../../poster-design-studio-024-call-test.md.
