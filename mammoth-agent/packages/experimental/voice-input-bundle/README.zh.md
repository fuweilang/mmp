---
description: "网页和桌面 profile 的语音输入；首次使用时宿主下载 SenseVoice。"
kind: "package-bundle"
---

# @mammoth-ai/mmp-experimental-voice-input-bundle

[English](README.md) | 中文

## 概述

此 Bundle 组合语音服务定义、本地 SenseVoice Provider、带认证的 Remote 与浏览器麦克风控件。网页 profile 会选中它，未改过的桌面 profile 选中同一列表。其他随附 profile 不选中。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在默认网页或桌面 profile 中，麦克风已经位于模型选择器和发送按钮之间。此 Bundle 设置 `prepareOnStart`，本地模型缺失时在启用时开始下载。下载未完成时，麦克风旁边只显示一句状态，不打开弹窗。缓存完整时保持待唤醒，首次录音再唤醒工作进程。准备尚未开始时，插件页被隐藏则点麦克风开始准备；插件导航存在时，启用引导仍提供“前往安装”。“前往安装”打开 Bundle 详情。“下载并准备”会显示硬盘、内存和时间估计；默认折叠的当前步骤摘要可展开为完整步骤列表。下载报告真实字节，校验和加载显示等待时间。就绪后点击模型选择器与发送按钮之间的麦克风，再点击停止以插入转写文字。Bundle 详情通过 Settings 服务保存识别器和语言。禁用 Bundle 会取消当前任务；缓存资源保留在磁盘上。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者信息 — 点击展开</summary>

静态 `cordis.patch.yml` 添加四个语音条目，选择 `sensevoice-local` 作为默认识别器，通过 `mmpHomePath` 提供 Provider 缓存目录，并设置 `prepareOnStart`，使缺失的缓存在 Bundle 启用时开始下载。网页模板选中此 Bundle，其他随附模板不选中。桌面复制该列表，并在组合包列表恰好是旧的一对或已经等于该模板时记下 `desktop-voice-input`。浏览器贡献拥有其生成 Remote 的挂载；稳定 API Remotes 不导入实验性代码。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[语音输入子系统](../../../docs/subsystems/voice-input.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为录音与准备不进入模型请求；之后的文字由普通用户提交拥有。

#### KV 缓存影响

没有直接影响；普通提交拥有消息内容。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 此 Bundle 提供一个本地识别器。额外 Provider 使用不同 id 注册到同一服务；云端识别需要显式增加 Provider 与凭据配置。Bundle 不增加模型工具或修改智能体循环。
- 安装 mmp 时会一并安装 `sherpa-onnx-node` 及其平台原生运行时（含 ONNX Runtime），即使此 Bundle 处于禁用状态。运行时的磁盘占用和下载量独立于“下载并准备”所下载的模型；原生包体积随平台和版本变化。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

无。

</details>
