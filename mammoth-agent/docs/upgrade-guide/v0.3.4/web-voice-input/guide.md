---
kind: upgrade-guide
description: "The web profile selects the voice-input bundle, and an unchanged stock list is rewritten once."
---

# The web profile selects voice input

English | [中文](guide.zh.md)

## Change

In v0.3.4, a stock profile named `web` stores `mmp.profile.bundles` as `@mammoth-ai/mmp-base` and `@mammoth-ai/mmp-web-app`. The next release adds `@mammoth-ai/mmp-experimental-voice-input-bundle` to `PROFILE_TEMPLATES.web` in `packages/util/official-bundles/src/bundles.ts`.

On startup, `loadProfile` rewrites a profile named `web` when that bundle list is exactly the older pair, or when the list already equals the new template and has not recorded this rewrite. It adds `web-voice-input` to `mmp.profile.bundleMigrations`. Removing the voice bundle afterward stays removed. A list that is not exactly the older pair, including one extra bundle, stays as written. Profiles whose name is not `web` stay as written. The acp, headless, sdk, and sdk-minimal templates do not gain the bundle.

The composer shows a microphone between the model selector and Send. Stopping transcribes the recording and inserts the transcript into the draft, unsent. Sending stays a separate action. The shipped bundle sets `prepareOnStart`. A missing SenseVoice model starts downloading on the machine that runs MMP when that process loads the bundle. A click during that work shows progress. After the files are verified, a later start only inspects the cache, and the first recording wakes the worker.

## Migration

1. Restart the web or desktop process. For a stock `web` profile, open `$MMP_HOME/profiles/web/package.json` and confirm `mmp.profile.bundles` lists `@mammoth-ai/mmp-experimental-voice-input-bundle` and `mmp.profile.bundleMigrations` includes `web-voice-input`.
2. If the bundle list was not exactly the older pair, add `@mammoth-ai/mmp-experimental-voice-input-bundle` to `mmp.profile.bundles` and restart.
3. After the model is ready, click the microphone, stop a recording, and confirm the transcript is in the draft and was not sent. The first start downloads the model on the machine running MMP; a later start reuses that cache.
