---
kind: upgrade-guide
description: "未改过的桌面 profile 选中语音输入组合包，该列表只重写一次。"
---

# 桌面 profile 选中语音输入

[English](guide.md) | 中文

## 变更

在 v0.3.5 中，`$MMP_HOME/profiles/desktop/package.json` 保持已有的 `mmp.profile.bundles`。新建的桌面 profile 复制 `packages/util/official-bundles/src/bundles.ts` 里的 `PROFILE_TEMPLATES.web`，其中包含 `@mammoth-ai/mmp-experimental-voice-input-bundle`。已有 profile 不会。

下一个版本在 `apps/desktop/src/project-manager.ts` 的 `createPluginProfile` 运行时重写该桌面 profile：其组合包列表恰好是 `@mammoth-ai/mmp-base` 和 `@mammoth-ai/mmp-web-app`，或者已经等于网页模板且尚未记录这次重写。它把 `desktop-voice-input` 写入 `mmp.profile.bundleMigrations`。之后去掉语音组合包会保持去掉。不是恰好旧列表的清单，包括多一个组合包的清单，保持原样。名为 `web`、`acp`、`headless`、`sdk` 和 `sdk-minimal` 的 profile 不受这次重写影响。

桌面输入框显示与网页 profile 相同的麦克风。停止后在运行桌面 Host 的机器上转写，并把文字放进草稿，且不会发送。

## 迁移

1. 重启桌面应用。打开 `$MMP_HOME/profiles/desktop/package.json`，确认 `mmp.profile.bundles` 列出 `@mammoth-ai/mmp-experimental-voice-input-bundle`，且 `mmp.profile.bundleMigrations` 包含 `desktop-voice-input`。
2. 如果组合包列表不是恰好的旧列表，把 `@mammoth-ai/mmp-experimental-voice-input-bundle` 加入 `mmp.profile.bundles` 后重启。
3. 模型就绪后点击麦克风，停止一次录音，确认转写文字在草稿中且没有被发送。首次启动会在这台电脑上下载 SenseVoice 模型。
