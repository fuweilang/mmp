# 猛犸中台（ground）

pnpm 工作区：`apps/backend`（Nest）、`apps/frontend`（Vue）、`packages/shared`。

功能：企业控制台、总后台、统一登录（OIDC）、角色与权限、AI 币钱包、支付充值。

## 前置

- Node.js >= 22.2.0（`.nvmrc` 为 `22`）
- pnpm 10.32.1
- Docker / Colima。Postgres 见 `infra/docker-compose.yml`，本机端口 5433
- 没有 `apps/backend/.env` 时：`cp apps/backend/.env.example apps/backend/.env`

## 本地

浏览器只开 **http://127.0.0.1:5201**。网关把 `/login`、`/console`、`/admin` 和 API 转到同一来源。5202 是 Vite，3100 是 Nest，平时不用直接开。

登录后默认进入智能体。地址带 `next` 时进入对应的控制台或总后台；平台管理员没有企业时进入 `/admin`。

```bash
cd ~/Documents/code/mmp/ground
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm run dev
```

`pnpm run dev` 和 `pnpm dev:prepare` 会先按锁文件安装依赖。改了依赖清单后，先单独运行 `pnpm install` 更新锁文件。`pnpm db:seed` 会打印本地账号，例如平台管理员 `13800000001` / `12345678`。

| 命令 | 作用 |
|---|---|
| `pnpm setup` | 装依赖、起库、迁移、seed、编译 |
| `pnpm dev` | 同步依赖、检查数据库，并启动 API、前端和网关 |
| `pnpm dev:prepare` | 只做同步和数据库准备 |
| `pnpm dev:api` / `dev:web` / `dev:gateway` | 分开启动，用来排障 |
| `pnpm db:up` / `db:down` / `db:migrate` / `db:deploy` / `db:seed` | 数据库 |
| `pnpm build` / `pnpm verify` | 编译 / 校验 |
| `pnpm version:*` | 发版时同步版本号 |
