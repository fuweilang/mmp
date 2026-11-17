---
kind: upgrade-guide
description: "A stock desktop profile selects the voice-input bundle, and an unchanged list is rewritten once."
---

# The desktop profile selects voice input

English | [中文](guide.zh.md)

## Change

In v0.3.5, `$MMP_HOME/profiles/desktop/package.json` keeps the `mmp.profile.bundles` list it already stored. A new desktop profile copies `PROFILE_TEMPLATES.web` from `packages/util/official-bundles/src/bundles.ts`, which includes `@mammoth-ai/mmp-experimental-voice-input-bundle`. An existing profile does not.

The next release rewrites that desktop profile when `createPluginProfile` in `apps/desktop/src/project-manager.ts` runs and the bundle list is exactly `@mammoth-ai/mmp-base` and `@mammoth-ai/mmp-web-app`, or already equals the web template and has not recorded this rewrite. It writes `desktop-voice-input` into `mmp.profile.bundleMigrations`. Removing the voice bundle afterward stays removed. A list that is not exactly that older pair, including one extra bundle, stays as written. Profiles named `web`, `acp`, `headless`, `sdk`, and `sdk-minimal` are unchanged by this rewrite.

The desktop composer shows the same microphone as the web profile. Stopping transcribes on the machine running the desktop Host and inserts the transcript into the draft, unsent.

## Migration

1. Restart the desktop application. Open `$MMP_HOME/profiles/desktop/package.json` and confirm `mmp.profile.bundles` lists `@mammoth-ai/mmp-experimental-voice-input-bundle` and `mmp.profile.bundleMigrations` includes `desktop-voice-input`.
2. If the bundle list was not exactly the older pair, add `@mammoth-ai/mmp-experimental-voice-input-bundle` to `mmp.profile.bundles` and restart.
3. After the model is ready, click the microphone, stop a recording, and confirm the transcript is in the draft and was not sent. The first start downloads the SenseVoice model on that computer.
