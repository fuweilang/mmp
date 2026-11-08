# Official agent assets

Version-controlled import pack for MMP `official_agent` drafts.

- `index.json` — mapping of latest agents (batch A/B/C/D) and field notes
- `agents/*.json` — draft fields (key/name/summary/openingQuestions/toolScope/kind/category/capabilities/avatar)
- `prompts/*.md` — systemPrompt bodies
- `avatars/*.jpg` — official gallery portraits (public branding)
- `kb/<key>/*.md` — official knowledge markdown when kind is KNOWLEDGE

## Avatar resolution

1. If `agents/<key>.json` sets `"avatar": "avatars/<file>.jpg"` and that file exists, use it.
2. Else if `avatars/<key>.jpg` exists, use the same-key file.
3. Else the public card returns `avatarUrl: null` and the client keeps the first-character glyph.

Historical remaps from `mammoth-platform-latest` `official-agents.ts` are recorded as explicit `avatar` fields (ip→growth, gzh→copy, niche→data, sell→live, method→trans, interview→qc). External URLs (e.g. naming master CDN) are not vendored into this tree. User/custom agent thumbnails never reuse these files.

Public HTTP: `GET /api/official-agents/avatars/<file>` (unauthenticated, assets/avatars only). Card `avatarUrl` is absolute under `GROUND_PUBLIC_ORIGIN` / `MMP_PLATFORM_ORIGIN` / `PUBLIC_ORIGIN` (default `http://127.0.0.1:5201`).

Version-frozen DB `avatar` columns are deferred; presentation today is filesystem + asset JSON, not an Admin upload product.

## Import

```bash
# Admin API (platform admin)
POST /api/admin/official-agents/import-assets

# Local script (publish + Huawei grant)
node scripts/import-official-agent-assets.mjs --publish-batch-a --grant-huawei
node scripts/import-official-agent-assets.mjs --publish-batch-d   # data/spy/boss
```

Rules: upsert draft by key; never overwrite published admin content; publish via existing Admin publish.

## Open-source method pilots (copy / gzh)

- Production prompts: `prompts/copy.md`, `prompts/gzh.md` (Chinese adaptations; not full upstream skills)
- Attribution + LICENSE copies: `third-party/SOURCE-MAP.md`, `third-party/*/LICENSE`
- Optional adapted notes (not auto-injected into runtime): `third-party/**/adapted-*.zh.md`
- Manual eval checklists: `evals/copy.eval.json`, `evals/gzh.eval.json`
- Draft-only sync (never publish):

```bash
node scripts/sync-official-agent-draft-prompts.mjs copy gzh
```

