---
kind: package-reference
description: "Execute official experts through native standard sessions with frozen knowledge and current authorization."
---

# @mammoth-ai/mmp-official-agent-gallery

English | [中文](README.zh.md)

## Summary

The Host creates native standard sessions from published experts or immutable creator-only previews. Frozen roles, skills, retrieval policy and generation model do not grant capabilities; native filesystem, shell, skills and their existing authorization remain available. Cloud tool scope controls only additional cloud tools.

Each message freezes its selected expert's full execution, knowledge and model configuration. The current expert defines the role; prior identities and methods remain historical. User facts and answers persist, with up to 16 previous speakers attributed in the logged prompt. Retrieval follows the current expert's knowledge configuration.

## Remote API

`create` accepts an expert and workspace. `createPreview` also accepts the immutable preview ID consumed by the gallery client's `expertPreview` URL entry. Both mount the standard preset. The Host negotiates execution protocol 2 while accepting exact legacy responses. Preview requests use the normal Ground adapter and preview attribution, with no fabricated published version or free provider path.

`openKnowledgeSource` resolves a persisted record ID and citation label inside the authorized Session, checks the original account/space, and sends the exact release/document/revision/index/chunk tuple to Ground. Unknown labels fail. The client reads body-free source metadata from the session projection; it never receives credentials, hidden prompts, or arbitrary storage URLs.

## Complete skill packages

Skill Sessions use the native standard preset's existing file and command tools. `skill` lists frozen summaries and returns the selected instruction and resource directory on demand. Package preparation never executes scripts or installs dependencies.

The Host requests `packageFormat=2` from Ground. A v2 revision declares every file's relative path, byte length, SHA-256 and executable flag, plus its sorted-tuple package digest and admission limits. Legacy instruction/reference responses remain supported; an unsupported or damaged complete response cannot downgrade to legacy preparation. Ground rejects old readers of complete revisions with an update-required error.

Complete execution copies live under the selected physical workspace's `.mmp/runtime/skill-packages/` directory, outside filesystem skill discovery roots. The Provider validates all identities before publishing a directory, bounds downloads while reading, and rejects symlinked roots. Failed directory reservations are cleared so repaired roots can be retried. Each path component is limited to 255 UTF-8 bytes, within the 512 UTF-16-unit relative-path ceiling shared with Ground. Reuse rechecks declared source files; changed sources create a fresh verified copy while old copies remain owned until cleanup. Selection invalidation cancels preparations and joins disposal before the next authorized model step. Each Provider owns its directories and shares no writable copies across Sessions.

Protocol ceilings are 500 files, 10MiB expanded bytes and 100KiB for SKILL.md. `skillMaxFiles`, `skillMaxTotalBytes` and `skillMaxInstructionBytes` configure lower local caps. Resource locations enter the model through the existing skill result; actual resource reads and script commands use the original tool policy and logs. Package files add no initial catalog tokens; loaded instructions and subsequent tool results add their actual content, with no separate KV-cache policy.

## Model Experience

### Current-request knowledge

#### What the model sees

REQUIRED retrieves from the current claimed visible user question before the first outgoing request. AUTO exposes on-demand retrieval without automatic admission. Both allow at most two operations per turn; OFF disables the knowledge tool. Tool arguments contain only the query. Tool results contain status only; required dynamic context carries bounded untrusted evidence and labels naming the owning turn and lookup. Failure and empty statuses remain distinct. REQUIRED without useful current evidence deterministically stops before model generation and exposes an actionable typed error. A failed supplemental lookup may continue only with still-authorized current evidence; AUTO retains explicit degradation.

The required context refresh runs after pre-step. Earlier runtime snapshots are replaced through logged native message replacements that remove only the `OFFICIAL_EXPERT_KNOWLEDGE` section and preserve other sections. The required evidence event records the binding, original account/space, operation reservation, order, exact source identities, budget, and rendered context. Historical labels never resolve through a later lookup's map. A Session-owned guard checks the exact logged evidence text after Ground body fitting; a changed or missing section stops HTTP rather than sending an unlogged excerpt.

#### Token effect

Frozen roles append to the native prompt. Active knowledge experts also receive a system instruction requiring exact bracketed source labels for document claims, forbidding invented source URLs or reconstructed passages, and separating creative examples from source facts. Evidence uses a conservative UTF-8 byte upper bound against the configured token allowance, including a framing reserve; supplemental data cannot duplicate the full body through a tool result. Tight budgets can truncate evidence or stop admission with actionable guidance. FIXED selects the actual Host model before prompt/capability budgeting; Ground remains authoritative at dispatch.

#### KV Cache effect

Replacing superseded evidence snapshots changes the request series and may reduce prefix reuse. All original records remain in the protected session log. Replays and compaction retain exact source lineage and reauthorize it before model resend; they never silently retrieve a newer document. Previously transmitted facts cannot be retracted.

## Known Limitations and Deferred Work

- Exact historical source text checks are deduplicated and serial, followed by one server statement snapshot authorizing all bindings and sources together. `maxHistoricalSources` defaults to 128 distinct sources or bindings; exceeding it stops resend and asks for a new chat. No embedding or rerank call occurs during authorization. A missing source, account change, expired preview, or changed lineage blocks resend, including summaries derived from that source.

- Engineering checks use synthetic Ground/model responses. Live provider semantic quality, supplier invoices and customer-account acceptance require separate verification. Legacy knowledge preview requires migration to new knowledge releases or explicit KNOWLEDGE_CORE/OFF; existing published legacy experts retain their old retrieval path. Internal Ground delegation to new REQUIRED/AUTO knowledge children remains unsupported.

- Recorded coverage includes the shipped `sdk` profile scenario `snapshots/sdk/official-expert-knowledge` and the Python SDK `sdk-official-expert` smoke projection. Both restore a recorded expert binding and use the real runtime with external account/Ground/model boundaries mocked.

- When a user names a method or framework but current evidence does not define it, the citation policy asks for a focused lookup by that name within the remaining lookup budget before applying it; missing support must still be disclosed.

- Product-copy examples may use only the specifications actually supplied by the user, without inventing performance claims or attributing imagined features to the user.
