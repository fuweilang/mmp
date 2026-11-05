---
kind: upgrade-guide
description: "The bundle lists and profile templates move from @mammoth-ai/mmp-app-boot to @mammoth-ai/mmp-official-bundles."
---

# Import bundle lists from `@mammoth-ai/mmp-official-bundles`

English | [中文](guide.zh.md)

## Change

`@mammoth-ai/mmp-app-boot` no longer exports `PROFILE_TEMPLATES`, `ProfileTemplate`, `DEFAULT_PROFILE_BUNDLES`, `OPTIONAL_BUNDLES`, `ON_DEMAND_BUNDLES`, `OFFICIAL_ON_DEMAND_CATALOG`, or `OfficialBundleCatalogEntry`. The new published package `@mammoth-ai/mmp-official-bundles` exports them with unchanged values and types. Code that imports any of these names from `@mammoth-ai/mmp-app-boot` fails to compile or load. The `mmp` launcher, profiles, and bundle selection behave as before.

## Migration

1. Add `@mammoth-ai/mmp-official-bundles` to the `dependencies` of each package that imports one of these names.
2. Change those imports from `@mammoth-ai/mmp-app-boot` to `@mammoth-ai/mmp-official-bundles`, for example `import { PROFILE_TEMPLATES } from '@mammoth-ai/mmp-official-bundles'`. Keep importing every other name, such as `initProfile` or `loadProfile`, from `@mammoth-ai/mmp-app-boot`.
3. Run your type check or build; it succeeds when no import of a moved name from `@mammoth-ai/mmp-app-boot` remains. See the [package README](../../../../packages/util/official-bundles/README.md) for each list.
