# Enterprise library

One Ground dataset is shared by authorized clients; originals are stored under `LIBRARY_DIR` (default `library-data` under the backend working directory). Deployments must mount persistent storage and back up both this directory and PostgreSQL. Do not put originals in the Agent home.

## Authorization

All data endpoints use the Ground login tenant and verify membership, ownership, explicit sharing, or an unexpired custody grant. Enterprise administrators do not inherit access to personal content. Platform operators see aggregate statistics, not file names. Shared-content custody requires approval by an administrator belonging to that tenant; private-owner custody requires the owner. Both approvers and platform operators can revoke applicable grants. Custody-based reads are audited.

## Files and versions

New file writes commit node, version and chunks in that order in one database transaction; a failed transaction removes the new blob. Replacement appends a version. Citations remain bound to the requested version, never a replacement. ZIP uploads are download-only. HTML previews are plain extracted text. PDF pages come from the installed PDF parser; DOCX reads only bounded document XML, with entities refused. No macros or HTML scripts execute.

Recycling blocks new source access. Restore preserves IDs, versions and scope. Permanent deletion is explicit. The configured retention period is informational until an independently authorized maintenance action is implemented; listing or reading statistics never permanently deletes files.

## Local checks

- `pnpm exec tsc --noEmit -p tsconfig.build.json`
- `pnpm run test:library`
- `LIBRARY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/mmp_library_acceptance pnpm run test:library:db`

The DB test refuses any URL except that dedicated local acceptance database. It must already contain current migrations. It owns and removes only its generated test rows and temporary files. No test key or model bypass is used. Unit model replies are test doubles, not evidence of real model execution.

## Remaining integration

The native Web/Desktop library plugin, the current-session draft selector, real cloud-model conversation, tenant grant approval UI and platform delegated browsing still need local implementation/validation. Do not present the Console management page or standalone `/ask` API as a finished native chat workflow. Parallel tenant quota reservations and immutable source-locator revision during reparse also require focused review before production readiness.
