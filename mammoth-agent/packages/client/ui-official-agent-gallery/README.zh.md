---
kind: package-reference
description: "在 Mac 或 Web 浏览官方智能体并开启会话。"
---

# @mammoth-ai/mmp-client-ui-official-agent-gallery

[English](README.md) | 中文

## 概览

Mac 与 Web 共用的 Ground 专家广场。浏览器通过 Host Remote 服务读取企业已获授权的公开卡片，支持搜索卡片文字、查看推荐问题，并在当前工作区开始会话。

浏览器只接收公开展示字段。会话版本冻结、授权检查、知识检索和用量归因由 `@mammoth-ai/mmp-official-agent-gallery` 负责。

预览启动独立于会话列表，从 Host 工作区列表选择存储位置，等待其基线就绪；仅在列表就绪且为空时调用既有首次使用默认工作区初始化。Host 创建会话后，先刷新会话目录再保留该会话；目录同步需要重试时复用已创建的会话。卸载会取消等待。

`expertPreview` URL 入口通过正常 Host 的 `createPreview` Remote 方法消费不可变管理预览，并在所选工作区打开标准会话。来源控件读取会话投影，保留原轮次与查询标签。位置显示标题路径、页码、段落或行号，不直接展示序列化 JSON。正文必须经过新的精确来源授权调用；未知标签不会成为链接。

预览入口等待工作区初始化时会自动重试，最多十秒；同一入口生命周期最多成功创建一个会话。内嵌预览在保留的会话输入可用后发送 `mmp.expert-preview.ready`，只接受来自同源父窗口的 `mmp.expert-preview.submit`，且必须匹配捕获的 `agentId`、`previewId`，提供非空且不超过128字符的 `requestId`，以及非空且不超过16000个 UTF-16 代码单元的 `text`。已有草稿保留，问题通过标准输入提交。`accepted` 表示已交接给输入流程，执行仍受正常输入检查和 Host 接收结果约束。重复请求标识回放原结果，不重复发送。输入就绪轮询最多十秒；插件卸载会移除监听和计时器。问题不会进入启动 URL。

## 模型体验

通过 Host 广场服务间接影响模型。该服务负责配置所选官方智能体并创建会话。

#### 对 KV 缓存的影响

请求前缀和缓存行为由 Host 负责。

## 已知限制与后续工作

- 官方头像优先使用 Ground 返回的 `avatarUrl`；同名 key 或有证据的历史映射（来自 mammoth-platform-latest）打包 jpg 作为本地回退；无图时保留首字色块。外部 CDN 头像不入库。
- 本地 Web 广场已带登录做过冒烟检查：22 张卡片、18 个头像加载成功、列表无错误。完整回归以及桌面打包和运行环境验收仍交由 QA。
