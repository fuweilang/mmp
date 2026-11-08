---
kind: package-reference
description: "在 Mac 或 Web 浏览官方智能体并开启会话。"
---

# @mammoth-ai/mmp-client-ui-official-agent-gallery

[English](README.md) | 中文

## 概览

Mac 与 Web 共用的 Ground 专家广场。浏览器通过 Host Remote 服务读取企业已获授权的公开卡片，支持搜索卡片文字、查看推荐问题，并在当前工作区开始会话。

浏览器只接收公开展示字段。会话版本冻结、授权检查、知识检索和用量归因由 `@mammoth-ai/mmp-official-agent-gallery` 负责。

## 模型体验

通过 Host 广场服务间接影响模型。该服务负责配置所选官方智能体并创建会话。

#### 对 KV 缓存的影响

请求前缀和缓存行为由 Host 负责。

## 已知限制与后续工作

- 官方头像优先使用 Ground 返回的 `avatarUrl`；同名 key 或有证据的历史映射（来自 mammoth-platform-latest）打包 jpg 作为本地回退；无图时保留首字色块。外部 CDN 头像不入库。
- 本地 Web 广场已带登录做过冒烟检查：22 张卡片、18 个头像加载成功、列表无错误。完整回归以及桌面打包和运行环境验收仍交由 QA。
