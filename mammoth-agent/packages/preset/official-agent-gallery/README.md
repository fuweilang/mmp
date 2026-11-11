---
kind: package-reference
description: "Execute Ground official Agents with frozen Sessions and current enterprise authorization."
---

# @mammoth-ai/mmp-official-agent-gallery

English | [中文](README.zh.md)

## Summary

Host service for Ground official Agents. It lists only public authorized cards, creates a Session with a frozen version event, rechecks Ground authorization before every model step and knowledge call, and sends official version usage attribution through `llm-ground`.

GENERAL Agents deny every tool. KNOWLEDGE Agents can expose only `enterprise_knowledge`; its arguments contain a query, never tenant or folder identifiers. Ground intersects the server-owned Agent folder scope with the member document ACL. The browser never receives tokens, system prompts, tool scopes, or folder scopes.

## Remote API

`list()` returns public `OfficialAgentCard` values. `create(request)` accepts an `OfficialAgentSessionRequest` with an Agent ID, a Workspace ID, and an optional opening question. The Host checks access before creating the Session.

## Model Experience

### Frozen official Agent

#### What the model sees

The `official-agent/bound` Session event records the complete frozen prompt and tool scope so replay reconstructs the model input. The version does not drift when a newer release appears. Revocation, unpublishing, membership removal, and enterprise suspension reject later steps. Knowledge results contain bounded snippets and source URLs; ordinary model requests carry official usage attribution, while auxiliary-purpose requests do not.

#### Token effect

The frozen prompt replaces the default persona. Retrieved snippets add tokens only when the knowledge tool returns them.

#### KV Cache effect

Each official Agent uses its frozen system prompt instead of the deployment persona. Knowledge snippets enter the model history only through the controlled tool result. Authorization failures add no model input.

## Complete skill packages

Skill Sessions use the native standard preset's existing file and command tools. `skill` lists frozen summaries and returns the selected instruction and resource directory on demand. Package preparation never executes scripts or installs dependencies.

The Host requests `packageFormat=2` from Ground. A v2 revision declares every file's relative path, byte length, SHA-256 and executable flag, plus its sorted-tuple package digest and admission limits. Legacy instruction/reference responses remain supported; an unsupported or damaged complete response cannot downgrade to legacy preparation. Ground rejects old readers of complete revisions with an update-required error.

Complete execution copies live under the selected physical workspace's `.mmp/runtime/skill-packages/` directory, outside filesystem skill discovery roots. The Provider validates all identities before publishing a directory, bounds downloads while reading, and rejects symlinked roots. Failed directory reservations are cleared so repaired roots can be retried. Each path component is limited to 255 UTF-8 bytes, within the 512 UTF-16-unit relative-path ceiling shared with Ground. Reuse rechecks declared source files; changed sources create a fresh verified copy while old copies remain owned until cleanup. Selection invalidation cancels preparations and joins disposal before the next authorized model step. Each Provider owns its directories and shares no writable copies across Sessions.

Protocol ceilings are 500 files, 10MiB expanded bytes and 100KiB for SKILL.md. `skillMaxFiles`, `skillMaxTotalBytes` and `skillMaxInstructionBytes` configure lower local caps. Resource locations enter the model through the existing skill result; actual resource reads and script commands use the original tool policy and logs. Package files add no initial catalog tokens; loaded instructions and subsequent tool results add their actual content, with no separate KV-cache policy.

## Known Limitations and Deferred Work

- Source URLs require a valid Ground browser login. Full Mac and Web model conversations and pilot-user acceptance require separate end-to-end checks.
