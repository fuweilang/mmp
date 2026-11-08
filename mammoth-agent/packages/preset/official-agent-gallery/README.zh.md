---
kind: package-reference
description: "使用冻结会话和当前企业授权执行 Ground 官方智能体。"
---

# @mammoth-ai/mmp-official-agent-gallery

[English](README.md) | 中文

## 概览

本 Host 服务提供 Ground 官方智能体。它只列出企业已获授权的公开卡片，创建会话时记录冻结版本，每次模型步骤和知识检索前重新检查授权，并通过 `llm-ground` 为用量记录标记官方智能体版本。

通用智能体禁用所有工具。资料型智能体仅可使用 `enterprise_knowledge`。工具只接收查询词，Ground 将服务端保存的目录范围与成员文档权限取交集。浏览器只接收公开展示字段。

## 远程 API

`list()` 返回公开的 `OfficialAgentCard`。 `create(request)` 接收 `OfficialAgentSessionRequest`，其中包含智能体 ID、工作区 ID 和可选开场问题。Host 在创建会话之前检查访问权限。

## 模型体验

### 冻结的官方智能体

#### 模型看到的内容

`official-agent/bound` 事件保存冻结的提示词和工具范围，供会话回放恢复。已创建会话仍使用原版本。撤权、下架、成员移除或企业停用后，后续步骤会被拒绝。知识检索返回限定长度的片段和来源链接。会话模型请求携带官方版本归因，辅助请求不参与归因。

#### 对 Token 的影响

冻结提示词替换默认身份。知识工具返回片段时，片段才会增加输入 token。

#### 对 KV 缓存的影响

每个官方智能体使用自己的冻结提示词。知识片段经受控工具结果进入模型历史。授权失败时不产生模型输入。

## 已知限制与后续工作

- 原文链接需要有效的 Ground 浏览器登录状态。Mac 与 Web 完整模型对话以及企业试点验收需要分别做端到端检查。
