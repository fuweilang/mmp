---
kind: upgrade-guide
description: "Shipped profiles require Ground for model credentials, catalog, and chat instead of direct provider routes."
---
# Ground-only model routing

English | [中文](guide.zh.md)

## Change

Shipped Web, Desktop, Headless, SDK, and ACP profiles layered on `mmp-base` no longer mount direct DeepSeek API-key, DeepSeek account, or `pi-ai` provider routes. Model discovery and chat require Ground OIDC and the Ground `/api/v1` endpoints. Ground administrators own vendor credentials and the available model pool.

Existing sessions and local files are retained. Unavailable local model selections are remapped to the Ground catalog.

## Migration

1. In Ground `/admin/models`, configure the vendor Base URL, API key, and models before upgrading clients. Keep vendor keys out of Harness settings and launch files.
2. Set `GROUND_PUBLIC_ORIGIN` to the Ground public origin, normally `http://127.0.0.1:5201` for local development or the deployed HTTPS origin. Remove direct-provider launch settings from product profiles.
3. Start the upgraded client and sign in with Ground SSO. Confirm that the model catalog shows `猛犸云端` and that a streamed chat request succeeds.
4. If no model appears, check the Ground model pool, the user's enterprise, and the enterprise AI-coin balance. Do not restore a local provider route as a fallback.
