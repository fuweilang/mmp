# Enterprise library

One Ground dataset is shared by authorized clients; originals are stored under `LIBRARY_DIR` (default `library-data` under the backend working directory). Deployments must mount persistent storage and back up both this directory and PostgreSQL. Do not put originals in the Agent home.

## Authorization

All data endpoints use the Ground login tenant and verify membership, ownership, explicit sharing, or an unexpired custody grant. Enterprise administrators do not inherit access to personal content. Platform operators see aggregate statistics, not file names. Shared-content custody requires approval by an administrator belonging to that tenant; private-owner custody requires the owner. Both approvers and platform operators can revoke applicable grants. Custody-based reads are audited.

## Files and versions

New file writes commit node, version and chunks in that order in one database transaction; a failed transaction removes the new blob. Replacement appends a version. Citations remain bound to the requested version, never a replacement. ZIP uploads are download-only. HTML previews are plain extracted text. PDF pages come from the installed PDF parser; DOCX reads only bounded document XML, with entities refused. No macros or HTML scripts execute.

Recycling blocks new source access. Restore preserves IDs, versions and scope. File purge is blocked with `409 / REFERENCE_UNVERIFIED`; empty folders and links retain explicit cleanup. The configured retention period is informational until an independently authorized maintenance action is implemented; listing or reading statistics never permanently deletes files.

## Local checks

- `pnpm exec tsc --noEmit -p tsconfig.build.json`
- `pnpm run test:library`
- `LIBRARY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/mmp_library_acceptance pnpm run test:library:db`
- `pnpm run test:library:http` includes both ordinary and Admin HTTP scenarios.
- `pnpm run test:library:backup` performs a real paired dump/restore to a newly created disposable localhost:55440 container.
- From Ground: `LIBRARY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/mmp_library_acceptance sh scripts/library-acceptance.sh` runs ordered checks, including a target guard before migrations, backup verification, Console and native source/session regressions, builds and the real Host replay E2E.

The DB test refuses any URL except that dedicated local acceptance database. It must already contain current migrations. It owns and removes only its generated test rows and temporary files. No test key or model bypass is used. Unit model replies are test doubles, not evidence of real model execution.

## Backup and remaining acceptance

The native Web/Desktop plugin adds chosen versions to the current draft and reauthorizes every source before sending. Citation Markdown retains the fixed version and locator across Session persistence. Parse retry commits status, chunks and success audit atomically; successful versions stay immutable. Actual cloud-model acceptance and desktop GUI checks are recorded separately from replay and component tests.

Use `infra/production/backup-library.sh` and `restore-library-local.sh` together with `scripts/verify-library-backup.mjs`; see the [operational instructions](../../../../infra/production/README.md#资料库配套备份与本地恢复). All originals, including historical/recycled versions, must match PostgreSQL. This is a Ground database plus library-originals backup, not a Harness Session or whole-system backup. Restore is deliberately restricted to a fresh dedicated local database and directory.

The [P0 acceptance handoff](../../../../docs/LIBRARY-P0-ACCEPTANCE.md) owns executed checks and remaining manual cells. Do not mark unexecuted four-surface, identity-expiry or codec checks passed, and do not present the standalone `/ask` API as native chat acceptance.
