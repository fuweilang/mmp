# 猛犸中台（ground）

pnpm monorepo：`apps/backend`（Nest）、`apps/frontend`（Vue）、`packages/shared`。

**Octop 已废弃。** 对话终端改为 sibling 仓库 **DeepSeek Harness**（`../mammoth-agent`，勿在本仓改）。本仓库只保留中台业务。

## 保留的业务

- Admin / Console
- SSO（OIDC）与统一 `/login`
- 角色、用户、权限（RBAC）
- Token 流水、AI 币钱包
- 支付 / 充值

## 前置

- Node.js >= 22.2.0（`.nvmrc` 为 `22`）
- pnpm `10.32.1`（`packageManager`）
- Docker / Colima：Postgres 见 `infra/docker-compose.yml`，宿主机 **5433**
- 无 `apps/backend/.env` 时：`cp apps/backend/.env.example apps/backend/.env`

## 本地端口（已定）

| 端口 | 是什么 |
|---|---|
| **5201** | **网关（浏览器只开这个）**：同源转发 `/login` `/console` `/admin` 与 API，SSO Cookie 才稳 |
| 5202 | 前端 Vite 直连（一般不用开） |
| 3100 | 后端 Nest API 直连（一般不用开） |

`pnpm dev` = api + web + gateway。开发期保留网关；不要只开 5202。

## 日常

```bash
cd ~/Documents/code/mmp/ground
pnpm install          # 可选：手动安装/更新依赖
pnpm db:up && pnpm db:migrate && pnpm db:seed   # 库未就绪时
pnpm run dev          # 同步依赖 → 检查数据库 → api → web → gateway，入口 5201
```

浏览器只开 **http://127.0.0.1:5201**。登录后默认进 **`/console`**（平台管理员无租户时进 `/admin`）。

`pnpm run dev`（含上级 `mmp` 目录的同名入口）和 `pnpm dev:prepare` 每次先执行 `pnpm install --frozen-lockfile --prefer-offline`，按锁文件同步工作区依赖，优先使用本地缓存。拉取代码或切换分支后无需额外手动安装；缓存缺包时仍需网络。安装失败或超过 180 秒会立即退出并显示原因，此时不会清理现有开发服务端口。若主动修改了依赖清单，请先运行 `pnpm install` 更新锁文件。单独运行 `dev:api` / `dev:web` / `dev:gateway` 不执行此准备步骤。

| URL | 含义 |
|---|---|
| `/login` | 统一登录 |
| `/console/` | 企业控制台 |
| `/admin` | 平台管理 |

`pnpm db:seed` 会打印本地账号，例如平台管理员 `13800000001` / `12345678`。

可选：`pnpm build`、`pnpm verify`（`verify-web` + `verify-api`）。排障：`pnpm dev:api` / `dev:web` / `dev:gateway`。

一键编排：`pnpm setup`（deps → db → build），然后 `pnpm run dev`。

## 脚本

| 脚本 | 作用 |
|---|---|
| `pnpm setup` | 装依赖 → 起库/迁移/seed → build |
| `pnpm setup:deps` / `pnpm install` | 装依赖 |
| `pnpm setup:db` | 起 Postgres + migrate deploy + seed |
| `pnpm db:up` / `db:down` / `db:migrate` / `db:deploy` / `db:seed` | 数据库 |
| `pnpm dev` | 同步依赖 → 检查数据库 → **前后端+网关一起跑**（入口 http://127.0.0.1:5201） |
| `pnpm dev:prepare` | 同步依赖并准备数据库，不启动或重启开发服务 |
| `pnpm dev:api` / `dev:web` / `dev:gateway` | 排障时拆开跑 |
| `pnpm build` / `pnpm verify` | 编译 / 校验 |
| `pnpm version:*` | 版本号同步（发版用） |

Octop / desktop / dashboard 相关脚本已删除。

