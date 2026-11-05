---
kind: upgrade-guide
description: "Web 开发改用 Ground 浏览器登录，并按用户和企业分别保存本地数据。"
---
# 本地 Web 开发使用 Ground 登录

[English](guide.md) | 中文

## 变更

`pnpm run dev:web` 和 `pnpm run start:web` 现在提供不含 Token 的本地入口。注册和登录统一由 Ground 提供。各浏览器使用自己的 Ground Cookie；每个经过校验的用户与企业进入独立的智能体进程和数据目录。API 调用方的启动 Token 机制、客户端原有登录流程保持不变。

原有 Web 会话保留在原 `MMP_HOME`，不会自动复制到登录账号的数据目录。本地路由仅用于受信任电脑上的开发联调，不是面向不可信用户的生产沙箱。

## 迁移

1. 启动 Ground，两边使用相同的本机主机名，通常为 `127.0.0.1`。Ground 不在 `http://127.0.0.1:5201` 时设置 `GROUND_PUBLIC_ORIGIN`。
2. 停止旧 Web 开发进程，运行 `pnpm run dev:web`。打开终端打印的干净入口，由 Ground 完成注册或登录。
3. 使用不同浏览器或浏览器配置文件测试不同账号。账号运行环境保存在 `MMP_HOME/web-identities/<identity-hash>`，凭证绑定经过验证的用户和企业。
4. 本地路由默认允许四个账号运行环境。启动前可通过 `MMP_WEB_MAX_IDENTITIES` 调整上限。
5. 确认不同用户、不同企业的对话和账号状态不共享。平台管理员显示 AI币无限，企业用户显示实际余额。
6. 如需原有开发专用启动 Token 流程，在运行 `pnpm run dev:web` 前显式设置 `MMP_WEB_SSO=0`。不要把其他用户的凭证或历史记录复制到账号隔离目录。
