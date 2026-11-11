---
kind: package-reference
description: "Browse official experts and skills and start a Session from Mac or Web."
---

# @mammoth-ai/mmp-client-ui-official-agent-gallery

English | [中文](README.zh.md)

## Summary

Shared Mac/Web gallery for Ground official experts and skills. The browser lists public authorized cards through the Host Remote service, searches card text, shows opening questions, and starts a Session in the current Workspace.

The browser receives no tokens, system prompts, tool scopes, or folder scopes. Session freezing, authorization checks, knowledge retrieval, and usage attribution belong to `@mammoth-ai/mmp-official-agent-gallery`.

Preview startup selects from the Host Workspace registry independently of Session-list readiness, waits for its baseline, and uses the existing first-use default initializer only when the ready registry is empty. It refreshes the Session catalog before retaining the Host-created session and reuses that session if catalog synchronization needs a retry. Disposal cancels the pending wait.

The `expertPreview` URL entry consumes the immutable admin preview through the normal Host `createPreview` Remote method and opens a standard conversation in the selected workspace. Source controls read the session projection and preserve each original turn/lookup label. Locations display headings, pages, paragraphs, or rows instead of serialized JSON. Source bodies require a fresh authenticated exact-source call; unknown labels never gain links.

The preview entry retries missing workspace initialization for up to ten seconds and creates at most one successful session per entry lifetime. An embedded preview announces `mmp.expert-preview.ready` after its retained session input becomes available. It accepts `mmp.expert-preview.submit` only from the same-origin parent window with the captured `agentId`, `previewId`, a nonblank `requestId` of at most 128 characters, and nonblank `text` of at most 16,000 UTF-16 code units. It preserves existing drafts and submits through the standard composer. The `accepted` reply acknowledges composer handoff; normal input guards and Host acceptance still determine execution. Duplicate request ids replay their original reply without resubmission. Input readiness polling stops after ten seconds; plugin disposal removes the listener and timers. Questions never enter the launch URL.

## Model Experience

Indirectly, through the Host gallery service that configures the selected official Agent and starts its Session.

#### KV Cache effect

The Host owns the request prefix and cache behavior.

## Known Limitations and Deferred Work

- Official portraits prefer Ground `avatarUrl`, then a bundled jpg (same-key or evidenced historical remaps from mammoth-platform-latest), then the first-character glyph. External CDN portraits are not vendored.

- The local Web gallery was smoke-checked with login after the avatar change: 22 cards, 18 loaded portraits, and no list error. Full regression and Desktop packaging/runtime acceptance are deferred to QA.
