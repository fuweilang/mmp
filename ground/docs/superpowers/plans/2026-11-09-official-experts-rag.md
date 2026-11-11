# Official Experts RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Complete implementation tasks sequentially with an independent review after each. A reproduced pre-existing locked-history validator failure blocks formal persistence acknowledgement/integration/release; keep that gate explicitly open while continuing independent implementation and test work, never suppress or claim it passed.

**Goal:** Deliver the approved V1 official-expert knowledge pipeline, configuration and conversation integration in the existing platform.

**Architecture:** Add knowledge-core alongside the three existing knowledge paths. Immutable document/index/release references feed a server-authorized retrieval service; published expert snapshots and Harness assembly consume that service. Keep old paths available for rollback.

**Tech Stack:** NestJS, Prisma, PostgreSQL/pgvector, Vue 3, TypeScript, Cordis Harness; existing encrypted provider credentials.

**Spec:** ../specs/2026-11-09-official-experts-rag-design.md

## Global Constraints

- Work only in /Users/luoxiaojun/.codex/worktrees/official-experts-rag/mmp. No commit, push, production mutation or deployment. Preserve existing behavior by default.
- User has no Embedding/Rerank service: implement configuration and integration, fail explicitly when unconfigured; never simulate real semantic retrieval or claim live quality acceptance.
- Only super_admin authors official experts, knowledge and service configuration. Enterprise documents require actual tenantId and current ACL; official bases have explicit PLATFORM scope.
- Test meaningful behavior RED then GREEN. Use focused tests and builds; do not run whole Harness suites or mutate the existing application database.
- Released document/index/dependency references are immutable. Current authorization wins over frozen versions. Credentials remain server-only.
- Evidence must enter the actual current model request and be reconstructable; never treat retrieved documents as instructions.
- V1.1 (OpenAPI tools, OCR and complex Office) remains the separately phased extension defined by the approved spec, not a V1 success claim.
- Implementers read owning AGENTS.md and relevant source; no subagents; reports record changed files, RED/GREEN commands, limitations. Controller keeps review artifacts rather than unauthorized commits.

## Review Focus

- Lease loss/cancellation during slow upstream requests must not promote stale chunks or release them.
- Replacement and profile changes must not silently change old published sessions.
- An answer at the end of a long Chinese document must remain retrievable with accurate locators.
- Cross-account/expert switching, revocation and evidence replay must not reuse another scope's results.
- Unconfigured/failed providers must differ from a successful search with no evidence; no fabricated citations or usage.

---

### Task 1: Token-aware knowledge and retrieval primitives

**Files:** Create ground/apps/backend/src/knowledge-core/{types,tokenizer,chunking,retrieval}.ts and ground/apps/backend/test/knowledge-core/core.unit.test.ts. Modify backend package.json and ground/pnpm-lock.yaml only for a verified tokenizer dependency.

**Interfaces:** Export serializable types KnowledgeScope (PLATFORM or TENANT with tenantId), TextSection, KnowledgeChunkInput, RetrievalEvidence, RetrievalResult; chunkSections(sections, options), reciprocalRankFusion(rankings), buildEvidenceContext(evidence, budget). Keep modules pure and no Prisma dependency. Later tasks import these interfaces; report exact exports.

- [x] Write and run failing tests: Chinese/emoji remain intact; markdown headings and paragraph/page/CSV row locators survive chunking; long paragraph terminates without lost tail; table headers accompany row groups; bounded overlap; empty document; deterministic hashes; rank fusion dedupes without adding incomparable scores; evidence budget and citation numbering remain consistent; malicious source text cannot escape structured data framing.
- [x] Implement actual tokenization (js-tiktoken is acceptable after verifying upstream documentation), declared encoding and injectable counter. Defaults target 600/max 900/overlap 80 tokens. Expose encoding identity; never claim this is a proprietary provider's exact tokenizer. Reject invalid options, avoid quadratic full-document work. Preserve source offsets and stable locators. Evidence budget defaults to 8000 and includes wrappers. RRF uses rank not raw score. Escape untrusted structured source data, not executable markup.
- [x] Run focused tests; shared build/backend typecheck if practical. Write full report to assigned report file, no commit.

### Task 2: Immutable storage, provider profiles and durable ingestion

**Files:** Add Prisma models/additive migration in ground/apps/backend/prisma; add knowledge-core profile/provider, storage, parser, jobs/worker, module, service and tests; add independent worker command to backend package.json. Do not rewrite existing knowledge tables.

**Interfaces:** Consume Task 1 types/chunker. Produce injectable KnowledgeCoreService and KnowledgeProfilesService, structured DTOs for safe profile reads (no secrets), durable upload/retry/cancel/inspect operations, release creation/read and retrieval store access. Publish these service signatures in report for next tasks.

- [x] First tests cover missing credentials/configuration, embedding batch/index/dimension/finite validation, rerank invalid indices, upstream timeout, encryption redaction, inactive profile, duplicate upload idempotency, cancellation/lease loss, transient retries versus permanent failure, unsupported/partial documents and immutable releases.
- [x] Add KnowledgeBase, document/revision/index/chunk/embedding, release/items, ingestion jobs, profiles and retrieval trace/usage models with indexes and constraints. Store learned vectors using new pgvector storage separated from legacy vector64; dimension is validated per immutable profile/index. PostgreSQL jobs claim atomically with lease, heartbeat, up to 3 transient retries after the initial attempt (4 total attempts) with backoff; cancellation fences final promotion. No unbounded in-request ingestion.
- [x] Provider profiles reuse existing LlmProvider encrypted credentials by reference; support OpenAI-compatible embeddings and explicit compatible rerank HTTP adapter. Separate task/model/dimension/tokenizer/timeout/batch limits, validate inputs/responses, bound HTTP bytes and counts, redact sensitive failures. Freeze profile model/dimension/encoding/endpoint contract (edit creates successor); provider credential rotation may retain its reference but provider endpoint edits must not redirect old index queries. Disabling a profile is explicit unavailability, never cross-model fallback. Do not require purchasing/configuring a real provider. Secrets are never in public DTOs or traces. Persist actual/estimated usage honestly.
- [x] Parser supports txt/md/csv/text PDF/docx with page/paragraph/row locator preservation and structure-aware chunking. 20MB initial upload limit; expanded XML/extraction/token limits; truncated extraction => PARTIAL, unsupported/scanned => DOWNLOAD_ONLY, no ready semantic index until every vector validates. Store immutable bytes under controlled paths, no original filename path traversal. Independent worker supports graceful exit and durable resume.
- [x] Validate migration from existing schema in an isolated temporary DB if available; otherwise generate SQL/check Prisma and report DB verification gap explicitly. Run focused RED/GREEN tests and backend build.

### Task 3: Authorized hybrid retrieval and super-admin knowledge API

**Files:** Add knowledge-core retrieval orchestration/controllers/DTOs/tests, wire module into app.module.ts; adapt existing Library/legacy source authorization through owning services where needed. LibraryModule currently imports LlmModule -> OfficialAgentModule, so do not import that HTTP module back into knowledge-core; extract/export a narrow LibraryDomainModule (existing store+LibraryService factory, no Llm/controller dependency) if needed and reuse the existing ACL implementation. Keep existing LibraryModule consumers working; test Nest boot and existing library regressions for module extraction. Add reusable super_admin assertion without broadening other admin powers.

**Interfaces:** Consume Task 2 services; produce /api/admin/knowledge-core profiles/bases/documents/jobs/releases/retrieval-test and authenticated exact-version source endpoints. API response RetrievalResult includes retrievalId, status, queries, evidence, degradation and timings; debug candidates super-admin only.

- [x] RED tests for tenant/user ACL, forged release/base IDs, long-document tail, Chinese exact identifiers, failed provider vs empty hits, rerank fallback, incompatible profile, budget, precise citation/open reauthorization and cancelled request.
- [x] Implement scoped dense exact cosine40 + Chinese lexical30, RRF merged20, rerank up to20/final6, dedup/diversity/authorized same-revision adjacency and token budget. Never apply ordinal take before relevance ranking. No universal uncalibrated threshold disguised as quality. Preserve original query; bounded same-conversation contextual query support/max3 subqueries with no cross-session facts. Required mode cannot turn provider error into no-evidence. Additional lookup budget enforced by session/turn.
- [x] Expose super_admin-only validated API upload/job status/retry/cancel/preview/profile health/release/test. Platform admins without super_admin rejected. Exact-version source route rechecks expert/session authorization and does not accept arbitrary client tenant/base scope. Keep raw query/body out of general logs; trace protected/minimal. No cache initially (avoids authorization staleness); document cache disabled.
- [x] Run focused tests/backend build and report actual HTTP contract for frontend/Harness.

### Task 4: Expert draft, immutable publishing, preview and compatibility

**Files:** Modify official-agent/admin DTO/services/controllers/schema, shared execution DTOs and narrowly scoped llm gateway/controller model-policy enforcement where needed; add expert-knowledge configuration helpers/tests and read-only legacy inventory/migration tooling. Fix seed idempotency narrowly.

**Interfaces:** Consume knowledge-core release/retrieval service. Extend draft and published snapshots with knowledge bindings, retrievalPolicy REQUIRED/AUTO/OFF, profile/config references and explicit route legacy/knowledge-core. Expose public resolved version policy and turn retrieval contract for Harness; admin-only immutable draft preview uses same runtime inputs. Snapshot identity is not a bearer token: require the creating super_admin on resolve/retrieve/source; include explicit expiry and usage attribution.

- [x] RED tests: only super_admin authors; draft edits do not alter published knowledge/skill versions; unready/missing dependencies block publication; rollback preserves snapshots; old expert data has safe legacy defaults; revoked grant/offline user/expert denies current retrieval; repeated seed never overwrites admin edits.
- [x] Add draft knowledge bindings and freeze ready releases/index/profile references plus policy at publication. New sessions use new published revision; existing sessions resolve bound version with current grants. No implicit enablement of unpublished agents. Preserve existing built-in tool checks and native capability policy. Freeze generation model selection policy separately from embedding/rerank: default AUTO retains current platform routing, FIXED references an enabled authorized chat model. Validate model/skill/tool dependency compatibility using available configuration. Enforce FIXED at actual gateway dispatch under revalidated expert/preview attribution (client model selection alone is not enforcement); preserve ordinary unattributed chat routing.
- [x] Preview creates an immutable admin-only snapshot, returns model/prompt/tools/knowledge policy compatible with standard runtime and retrieval, attributes usage to actor; never expose an unrestricted free model proxy. Add resolve/retrieve/source version compatibility without breaking legacy clients. Existing Harness execution DTO uses strict Zod: negotiate executionProtocol=2 for new fields/routes; legacy experts keep legacy response shape, while knowledge-core REQUIRED experts reject old protocol with an actionable client-upgrade error instead of silently omitting retrieval policy. New Host sends protocol2; preview requires the new contract. V1 immutable knowledge preview requires new published knowledge releases: LEGACY knowledge capability must fail creation with actionable migration/explicit-OFF guidance; prompt-only LEGACY preview and existing published legacy execution stay supported. Never return a launch contract that cannot execute its advertised knowledge capability, or pretend a mutable legacy corpus is frozen. Read-only inventory and opt-in shadow migration retain original IDs/ACL/content hashes; no automatic online writes or auto-publish.
- [x] Run focused tests/backend build; report runtime wire schema and preview launch contract.

### Task 5: Super-admin configuration and retrieval diagnostics UI

**Files:** Modify ground/apps/frontend/src/api/admin.ts, existing AdminOfficialKnowledge.vue/AdminOfficialAgents.vue, relevant model/profile page/navigation/localization; add focused frontend helper tests when behavior merits them.

**Interfaces:** Consume Tasks 3–4 HTTP contracts; keep existing admin UI styling/routing. User actions occur in browser http://127.0.0.1:5201 only.

- [x] Build service profile form (provider/model/task/dimension/tokenizer/limits, safe health probe), KB CRUD/upload/status/retry/cancel, document/chunk preview/locators, releases, question retrieval tester/candidates/evidence/status/timing, expert prompt+skills+tools+knowledge release selection+policy, publication dependencies/history/rollback and preview launch.
- [x] Show upload success separately from semantic readiness, PARTIAL/DOWNLOAD_ONLY clearly; no configured services means actionable pending configuration. Preserve failure details safely, disable unavailable publication and surface server errors. Hide authoring from non-super-admin but enforce server authorization independently.
- [x] Verify frontend typecheck/build and focused behavior tests. If backend running safely available, inspect UI flow; never connect acceptance actions to production. Report any unverified live flow.

### Task 6: Harness current-turn retrieval, replay and sources

**Files:** Modify mammoth-agent/packages/preset/official-agent-gallery, necessary existing credential/reference hooks, and narrowly scoped preview-launch/source-view client wiring in packages/client/ui-official-agent-gallery. No generic runtime loop changes. Read mammoth-agent AGENTS and package AGENTS before edits; keep Cordis extension design and localization.

**Interfaces:** Consume Task 4 resolve/retrieve/preview wire contract. Add typed persisted retrieval evidence event and current-request prompt-context contribution, keyed exact session/turn/expert revision. Actual source uses system-prompt/assemble and SystemPrompt.context with refreshContext at admission, not a literal model-input/assemble event. Keep legacy protocol accepted.

- [x] First focused tests prove REQUIRED retrieval evidence is in the very first actual outgoing model request; failure/empty statuses represented correctly; AUTO tool bounded additional once; OFF disables; cancellation/account/expert switch drops stale result; repeat assembly avoids duplicate charges; current authorization rechecked on replay/source open; no secrets; frozen version exact citations; supplemental lookup and historical messages keep exact source identity (never resolve an old S1 against the latest source map). Evidence/body duplication across dynamic context and tool outputs cannot evade the current-request RAG budget.
- [x] Integrate via actual supported system-prompt assembly/context and typed event mechanisms, not loop mutation or a section updated after it was already rendered. The loop assembles sections before pre-step, then refreshes registered dynamic contexts after pre-step before the actual request. Retrieval may use the current claimed user message in pre-step provided registered required context is refreshed into the same request and tests inspect final wire content. Persist enough protected evidence/order/budget/version metadata to reconstruct actual model input; replay reauthorization never silently fetches newest doc. Retrieved prompt-like text stays untrusted data. Source UI links exact revision/chunk/locator and only claims citation existence when returned. Persist citation-to-source identity at the owning turn/message, so later retrieval/replacement cannot redirect historical links. Supplemental retrieval must preserve correct source mappings and bound the combined current evidence; avoid emitting the same full body in both a tool result and dynamic context. Preview admin snapshot flows through same provider/runtime, no unauthorized capability grants. Wire admin preview launch to an actually consumed Harness entry (for example expertPreview URL parameter consumed by gallery client -> Remote createPreview), not a dead URL or plain retrieval-only test. Local browser automation uses gateway127.0.0.1:5201/agent, not direct3080.
- [x] Run focused Harness tests/typechecks/build artifacts needed for touched packages, not the entire workspace. Document model-visible request evidence and remaining real provider acceptance gap.

**Acceptance note:** Runtime/source task review passed after fix2; formal persistence acknowledgement remains an independently reproduced HEAD-history integration/release blocker under the recorded ruling. It is not passed or fully release-accepted.

### Task 7: End-to-end verification, migration safety and delivery

**Files:** Add ground/apps/backend/test/knowledge-core integration/evaluation fixtures and ground/docs official expert operating/acceptance guide; adjust only verified defects in existing task ownership.

**Interfaces:** Exercise full Tasks 1–6 contracts, use isolated temporary DB and local mock HTTP provider only for engineering tests (never claim learned relevance).

- [x] Resolve the previously confirmed small validation/source-accuracy defects as part of final verification, with focused RED/GREEN tests: Task1 safe range-end integer validation; Task2 heading-at-section-entry metadata; float32 all-zero underflow rejection; actual-browser-confirmed Chinese multipart filename normalization in new Core upload (reuse existing Library transport handling, preserve exact original filename). Their original reports remain in the ledger; do not broaden into baseline dependency upgrades. All new RAG code/data is still unreleased and isolated test fixtures, so no production index is rewritten. Also repair the confirmed new-profile FK impact on existing supplier deletion: referenced-provider removal must give an actionable dependency conflict, and last-chat-model removal must preserve a supplier still referenced by immutable retrieval profiles (or fail explicitly without generic500); no cascading profile deletion. Root actual HTTP probe and source evidence are in the ledger. Complete the confirmed RAG-only supplier configuration gap: existing chat-model form requires a Model ID and hides zero-model suppliers; add a minimal super-admin-only credential create/manage path reusing existing encrypted provider ownership, without adding retrieval models to the chat pool. Test zero-chat-model creation/edit/reference and safe key masking.
- [x] Supply fixed 60-question evaluation format/fixtures (15 direct/15 paraphrase/10 followup/10 crosschunk/10 no answer), measure answerable50 Hit@5 and complete multi-evidence separately; machine-check citation locator/version and manual faithfulness checklist. Fixture ground truth must be real fixture content, never fabricated real customer quality.
- [x] Integration verifies upload→worker→ready→release→expert publish→current request evidence→exact citation, replacements/index changes/cancel/revoke/provider failure and old route rollback. Separate mock transport/state acceptance from live semantic quality. Run required builds and focused regression suites once, investigate baseline failures rather than hiding them.
- [x] Final independent architecture review across complete patch and fix findings; no commit/push/deploy. Provide Chinese step-by-step browser/terminal/configuration guide, exact files/test evidence, implemented versus unconfigured/unverified and V1.1 next phase. Do not declare all acceptance targets achieved without real models/accounts.

**Acceptance note:** Implementation and local engineering verification completed; independent Task7 and final whole-patch/scoped fix reviews completed. All seven final findings addressed, plus the two documentation href errata corrected and checked. Formal persistence acknowledgement remains integration/release BLOCKED by unchanged historical-schema validation failure. Real-model relevance/no-answer/faithfulness, invoices, real-account/production/device acceptance and V1.1 remain unaccepted. No commit, push, merge or deployment.
