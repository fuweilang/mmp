# Managed experts v1 — draft-only

24 independently curated role adaptations, not 24 renamed skills. Business10 / development-design9 / research-data5. MIT20 / Apache-2.0 4. All original text/attribution is retained in upstream/ and per-expert provenance/; do not execute snippets, hooks or tool declarations from those documents.

- experts/*.json: canonical internal manifests with profile, workflow/deliverables, optional linkedSkillKeys and expertDefinition metadata.
- instructions/*.md: substantive Chinese role instructions and explicit host limitations. Structured workflow/deliverables compose into the frozen execution prompt; do not bulk-inject linked SKILL.md bodies.
- SOURCE-MAP.{json,md}, FETCHED-FILES.json and *-index.json: immutable refs, exact URLs/hashes, nearest applicable licenses and community-selection evidence. Stars are not execution scores.
- provenance/<key>/{LICENSE,NOTICE.txt,ORIGIN.json}: local applicable license copy, original attribution and explicit modifications.
- IMPORT-RESULT.json: first import created24; IMPORT-RERUN-RESULT.json: idempotent rerun skipped24, created0. No publishing/grants.
- LINK-ADAPTATION-RESULT.json: removed one own newly-created Academy guide link because Claude Academy is not general enterprise training. First receipt retained, final graph is44 links to38 distinct existing skills, not45/39.
- CURRENT-CATALOG.json: final actual DB counts/names and bindings; PRESERVATION-BASELINE.json / PRESERVATION-RESULT.json: original22 experts,47 versions,115 skills/packages, grants and KB rows preserved.
- ASSET-PRESERVATION-RESULT.json: 40 fetched immutable text hashes and797 existing skill-package file hashes unchanged.

Local import (after the already-approved additive migration/client generation and Backend resource emission):

    node scripts/import-official-agent-assets.mjs --managed-v1
    node scripts/import-official-agent-assets.mjs --managed-v1 --result=IMPORT-RERUN-RESULT.json
    node scripts/expert-catalog-integrity.mjs

Importer reuses the Admin asset loader and expert normalizer, creates missing keys only, and preserves all existing same-key rows. Do not pass publish/grant flags for managed-v1. Explicit editing belongs in Admin; drafts require user approval before publication.

Current Host denies inherited file/terminal tools for official experts. The9 developer/design roles therefore deliver engineering analysis and code/patch drafts, not automatic repository edits. No new permissions were introduced. The literature role lacks BGPT MCP and uses only public/user-provided evidence; SaaS-dependent sales flows remain within an explicitly adapted role, not fake standalone tool skills. Existing usable same-origin skill packages are reused; new skill packages=0. Linked packages retain their own licenses independently.

No tests, browser/E2E, QA/review, dedicated typecheck or full build was run. Resource sync and import/conservation counts are not behavioral acceptance.
