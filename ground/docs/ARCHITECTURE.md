# 猛犸智能体 · 架构决策（v0.4）

> 换模型先读本文件 + 根目录 `AGENTS.md`。改决策只改这里，不要回放聊天。


> **2026-11 更新**：Octop 运行时/桌面已废弃；终端改为 DeepSeek Harness（`../mammoth-agent`）。本文件下文仍有历史 Octop 描述，以根目录 `AGENTS.md` / `README.md` 为准。中台（Admin/Console/SSO/权限/Token/支付）保留。

## 一句话

企业产品 = **本机客户端（Octop 运行时 + 工作区）为主**，网页为辅。中台管登录/租户/成员/企业控制台；客户端跑 Agent，读写客户本机工作区（代码、PPT、本地文件）。网页只做登录、管理后台、无客户端时的对话（无本地盘能力）。

## 已拍板

| 项 | 决策 |
|---|---|
| 给谁用 | 企业客户（财务/法律），不是猛犸内部运营后台 |
| 中台 | NestJS + Prisma → PG `mammoth_core`；Vue3 + Element Plus |
| 向量 | 中台 pgvector；不用 MySQL 做向量 |
| 用户 | 中台 IdP（手机号 Cookie `mammothai_access_token`） |
| 登录 URL | **`/login`**（`apps/frontend` 路由）。不是 `/console/login`、不是 `/agent/login` |
| SSO | 登一次：中台 Cookie + Octop OIDC 换 JWT。退出两边都清 |
| 默认首页 | 客户端打开即对话。网页 `/agent/chat` 无本地盘能力 |
| 知识库 | 云知识库仍在中台；本机文件走客户端工作区 |
| 租户 | 一企业多 Agent；账号在中台；本机运行时按登录身份工作 |
| PeecAI | 不迁 MySQL；身份单向同步（未做） |
| 交付 | **主推客户端下载**（本机 Octop 运行时）。网页辅：登录、`/console`、无客户端时的对话 |
| 客户本机磁盘 | **做**：Agent 读写本机**工作区目录**。首次写盘必须说清范围，禁止默认扫全盘 |
| 客户端更新 | 应用内更新，不要求客户每次重装 |
| 仓库 | 根目录新 git；`Octop/` gitignore 上游；`coze-studio/` 无关 |
| 地址 | 本地服务只写 `http://127.0.0.1:5201`。`192.168.5.4:5201` 只是同一台网关的局域网打开方式，不写进代码。生产只写 `https://www.mmai.vip` |
| Octop 大文件 | 不拆 `manager.py`、`chatStore.ts`、locales。只留胶水，跟稳定版。拆了以后合上游更贵，省不了 token |

## 本地怎么跑（不要 `pnpm dev` 一把跑）

网页联调：浏览器只开 **http://\<host\>:5201**。客户端联调另开 `pnpm dev:desktop`。

| 命令 | 端口 | 作用 |
|---|---|---|
| `pnpm dev:api` | 3100 | 中台 Nest |
| `pnpm dev:web` | 5202 | Vue（`/login` + `/console`） |
| `pnpm dev:gateway` | **5201** | 统一入口 |
| `pnpm dev:octop` | 8088 | Octop 后端 |
| `pnpm dev:agent` | 5203 | Octop dashboard |
| `pnpm dev:desktop` | 5210 + Wails | 猛犸智能体。窗口开源码页面，接口走 8088，不另起 Octop |

网关：`/login` `/console` → 5202；`/console/api`（及旧 `/middle/api`）→ 3100；`/agent` → 5203；`/api` → 8088。`/` → `/agent/chat`。`/middle` → `/console`；`/console/login` `/middle/login` → `/login`。

## 目录

```
agentPlatform/
├── apps/backend/     NestJS
├── apps/frontend/    Vue3：/login 登录，/console 企业控制台
├── packages/shared/
├── infra/            docker-compose PG
├── Octop/            上游运行时 + desktop 客户端，白标猛犸AI；别大改结构
├── scripts/dev-gateway.mjs
└── docs/ARCHITECTURE.md
```

## 库

同一 PG 实例、不同 database：`mammoth_core`（Prisma）/ Octop 自带库。禁止跨库 JOIN。

Octop SQLite 的 `users` / `user_role` / `user_sso_identities` = 运行时影子用户（OIDC 映射），**不是产品账号**。产品账号只在中台。

## 中台表

已建：`user` / `tenant` / `org_tree` / `org_member` / `audit_log` / `agent_ref` / `agent_grant` / `kb_folder` / `kb_document` / `kb_grant`

已建：`usage_event`、`quota`、`kb_chunk`（pgvector）
未建：`conversation`/`message`

## 明确不做（v0）

改造 Octop 前端当产品壳；给 Octop 加 `tenant_id`；PeecAI 迁 PG；N 个 Octop 容器；中台回写 PeecAI；云 Agent 遥控客户电脑；默认扫客户全盘；换成 Hermes/Pi/Codex 形态。

## 当前进度

- 登录 + 租户 + 成员可用
- 统一 `/login` + Cookie SSO（刚接上，需 5 Tab 一起开着验）
- Agent 刷新 loading 已改蓝圈、无 Octop logo
- 控制台 P0：智能体 / 知识库 / 本企业成员 / 工作台；「租户」仅超管；普通成员进 `/agent/chat`
- KB 文件在中台，对话检索走中台 `kb*`（带 tenant_id）；企微未做
- P1：用量/配额、审计、企业设置

## 还没拍（v0 不做）

代理商能否用 Agent；引用高亮；小程序审核；独立实例；PeecAI 先同步哪几张表。
