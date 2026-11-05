---
kind: upgrade-guide
description: "Web development uses Ground browser login and separate homes for each user and enterprise."
---
# Ground login for local Web development

English | [中文](guide.zh.md)

## Change

`pnpm run dev:web` and `pnpm run start:web` now open a clean loopback URL. Ground owns registration and login. Each browser uses its own Ground cookie, and each verified user and enterprise is routed to a separate Harness process and home. API operator launch-token behavior and Desktop sign-in remain unchanged.

Previous Web sessions remain in the original `MMP_HOME`. They are not automatically copied into an authenticated user's partition. The local router is for development on one trusted computer, not a production sandbox for untrusted users.

## Migration

1. Start Ground and use the same loopback hostname for both services, normally `127.0.0.1`. Set `GROUND_PUBLIC_ORIGIN` if Ground is not at `http://127.0.0.1:5201`.
2. Stop older Web development processes and run `pnpm run dev:web`. Open the printed clean URL; register or log in through Ground.
3. Use separate browsers or browser profiles to test separate accounts. Workers store data under `MMP_HOME/web-identities/<identity-hash>`; their credentials are pinned to the verified user and enterprise.
4. The local router permits four active identity workers by default. Set `MMP_WEB_MAX_IDENTITIES` before startup to change that limit.
5. Confirm that different users and enterprises do not share conversation history or account state. Platform administrators display unlimited AI coins; enterprise users retain actual wallet balances.
6. For the previous developer-only launch-token flow, explicitly set `MMP_WEB_SSO=0` before `pnpm run dev:web`. Do not copy another user's credentials or history into an identity partition.
