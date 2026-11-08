---
kind: package-reference
description: "Browse official experts and skills and start a Session from Mac or Web."
---

# @mammoth-ai/mmp-client-ui-official-agent-gallery

English | [中文](README.zh.md)

## Summary

Shared Mac/Web gallery for Ground official experts and skills. The browser lists public authorized cards through the Host Remote service, searches card text, shows opening questions, and starts a Session in the current Workspace.

The browser receives no tokens, system prompts, tool scopes, or folder scopes. Session freezing, authorization checks, knowledge retrieval, and usage attribution belong to `@mammoth-ai/mmp-official-agent-gallery`.

## Model Experience

Indirectly, through the Host gallery service that configures the selected official Agent and starts its Session.

#### KV Cache effect

The Host owns the request prefix and cache behavior.

## Known Limitations and Deferred Work

- Official portraits prefer Ground `avatarUrl`, then a bundled jpg (same-key or evidenced historical remaps from mammoth-platform-latest), then the first-character glyph. External CDN portraits are not vendored.

- The local Web gallery was smoke-checked with login after the avatar change: 22 cards, 18 loaded portraits, and no list error. Full regression and Desktop packaging/runtime acceptance are deferred to QA.
