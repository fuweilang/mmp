---
kind: upgrade-guide
description: "Official expert knowledge sessions require protocol 2 and readers that recognize durable evidence lineage."
---

# Official expert knowledge and preview sessions

English | [中文](guide.zh.md)

## Change

The Host negotiates Ground execution protocol 2 and accepts unchanged legacy responses. New official knowledge sessions persist the required `official-agent/knowledge` event, frozen execution policy, and native logged replacements of superseded evidence context. Older readers without that event vocabulary must refuse these sessions. Preview bindings have a null published version and an immutable preview identity. Existing legacy session logs remain readable; new evidence is never inferred from an absent field.

FIXED experts select their frozen model before Host budgeting. An unavailable explicit cloud model fails instead of silently changing models. Preview attribution uses `x-mmp-expert-preview-id`; published runs continue to use the version header.

## Migration

1. Upgrade Ground to support execution protocol 2 and upgrade every Host/session reader before creating new knowledge or preview sessions. Preserve all stored session generations. Do not downgrade a session containing required evidence events.
2. Keep the standard preset and gallery plugin in the supported `mmp` profile. Configure `maxHistoricalSources` only when the deployment needs a different bounded historical authorization limit; the default is 128.
3. Open the configured Host URL with `expertPreview` and `expertId` to consume an admin preview. Select an existing workspace. Creator authorization and the 30-minute expiry are rechecked by Ground.
4. Verify that REQUIRED evidence appears in the first actual model request, citations reopen the original five-ID source, and revoked or unavailable historical sources block resend. Start a new chat when the historical authorization limit is reached. Select an available model or recreate the expert snapshot when its fixed model is unavailable.

REQUIRED with no usable current evidence now stops before model HTTP with a distinct actionable error. Supplemental failure can continue only with still-valid current evidence. The final Ground provider guard also refuses any fitted request that changes the exact logged evidence section; start a shorter chat or ask an administrator for a larger model.
