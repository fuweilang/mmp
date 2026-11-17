---
kind: upgrade-guide
description: "网页 profile 选中语音输入组合包，未改过的默认列表只重写一次。"
---

# 网页 profile 选中语音输入

[English](guide.md) | 中文

## 变更

在 v0.3.4 中，名为 `web` 的默认 profile 把 `mmp.profile.bundles` 存为 `@mammoth-ai/mmp-base` 和 `@mammoth-ai/mmp-web-app`。下一个版本在 `packages/util/official-bundles/src/bundles.ts` 的 `PROFILE_TEMPLATES.web` 中加入 `@mammoth-ai/mmp-experimental-voice-input-bundle`。

启动时，`loadProfile` 会重写名为 `web` 的 profile：其组合包列表恰好是上述旧列表，或者已经等于新模板且尚未记录这次重写。它把 `web-voice-input` 写入 `mmp.profile.bundleMigrations`。之后去掉语音组合包会保持去掉。不是恰好旧列表的清单，包括多一个组合包的清单，保持原样。名称不是 `web` 的 profile 保持原样。acp、headless、sdk 和 sdk-minimal 模板不加入该组合包。

输入框在模型选择器和发送按钮之间显示麦克风。停止后把整段录音转写成文字放进草稿，并且不会发送。发送仍是单独的操作。随附组合包设置 `prepareOnStart`。SenseVoice 模型缺失时，加载该组合包的进程会在运行 MMP 的机器上开始下载。下载未完成时点击麦克风会看到进度。文件校验通过后，之后的启动只检查缓存，首次录音再唤醒工作进程。

## 迁移

1. 重启网页或桌面进程。对于未改过的 `web` profile，打开 `$MMP_HOME/profiles/web/package.json`，确认 `mmp.profile.bundles` 列出 `@mammoth-ai/mmp-experimental-voice-input-bundle`，且 `mmp.profile.bundleMigrations` 包含 `web-voice-input`。
2. 如果组合包列表不是恰好的旧列表，把 `@mammoth-ai/mmp-experimental-voice-input-bundle` 加入 `mmp.profile.bundles` 后重启。
3. 模型就绪后点击麦克风，停止一次录音，确认转写文字在草稿中且没有被发送。首次启动会在运行 MMP 的机器上下载模型；之后的启动复用该缓存。
