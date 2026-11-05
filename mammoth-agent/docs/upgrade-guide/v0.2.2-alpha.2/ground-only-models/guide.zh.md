---
kind: upgrade-guide
description: "正式配置改为由 Ground 统一管理模型凭证、目录和对话，不再挂载直连厂商路由。"
---
# 仅通过 Ground 调用模型

[English](guide.md) | 中文

## 变更

使用 `mmp-base` 的正式 Web、Desktop、Headless、SDK 和 ACP 配置不再挂载 DeepSeek API Key、DeepSeek 账号或 `pi-ai` 直连厂商路由。模型目录和对话必须通过 Ground OIDC 与 Ground `/api/v1` 接口。厂商凭证和可用模型池由 Ground 超管统一管理。

已有会话和本地文件保留。不可用的本地模型选择会回落到 Ground 模型目录。

## 迁移

1. 升级客户端前，在 Ground `/admin/models` 配置厂商 Base URL、API Key 和模型。厂商 Key 不要写入 Harness 设置或启动文件。
2. 将 `GROUND_PUBLIC_ORIGIN` 设置为 Ground 公开地址，本地开发通常为 `http://127.0.0.1:5201`，生产使用部署的 HTTPS 地址。删除产品配置中的直连厂商启动项。
3. 启动升级后的客户端并重新通过 Ground SSO 登录。确认模型目录显示 `猛犸云端`，且流式对话可以完成。
4. 如果没有可用模型，检查 Ground 模型池、用户所属企业和企业 AI 币余额。不要恢复本地厂商路由作为备用路径。
