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

## Known Limitations and Deferred Work

- Source URLs require a valid Ground browser login. Full Mac and Web model conversations and pilot-user acceptance require separate end-to-end checks.
