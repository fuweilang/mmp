# ground（猛犸中台）

猛犸智能体中台仓库。**换模型先读 `docs/ARCHITECTURE.md` 与 `docs/INTEGRATION.md`，再读本文件，进行中的改动读 `openspec/`。不要回放旧聊天。**

说话用中文、简短；引用代码用 `path:line`。不擅自 commit/push、不扩大范围。

## 架构现状（2026-11）

| 组件 | 状态 |
|---|---|
| **本仓库 `ground`** | 猛犸中台：Admin / Console / SSO / 角色用户权限 / Token 流水 / 支付充值 |
| **DeepSeek Harness** | 新终端（sibling：`../mammoth-agent`）。**不要在本仓库改 Harness** |
| **Octop** | **已废弃**。不再作为启动入口；旧文档在 `docs/_archived/octop/` |

### 业务保留清单（勿删）

- 登录 / OIDC SSO：`apps/backend` auth、oidc；`apps/frontend` `/login`
- 平台 Admin：用户 / 角色 / 企业 / 审计 / **模型管理** / 计价 / 钱包
- 企业 Console：工作台 / 成员 / 角色 / 知识库 / AI 币充值与用量
- Token 流水、支付充值、权限（RBAC）
- `apps/backend/src/billing/octop-*.ts`：标 `@deprecated`，仅避免计费编译断裂；无 `octop.db` 返回空

### 已移除的 Octop 胶水

- 根脚本：`octop` / `dev:octop` / `dev:agent` / `dev:desktop` / `dashboard:*`
- `scripts/dev-desktop.mjs`
- 网关不再代理 `:8088` / `:5203`；`/agent` → `/console`
- 宝塔：`Dockerfile.octop`、compose `octop` 服务、`publish-desktop-baota.sh`、`.github/workflows/octop-desktop.yml`

## 发布猛犸宝塔

用户说 **「发布猛犸宝塔」** → 读并遵守相关 baota Skill / `infra/baota/`（中台 api + web + postgres）。**不再发 Octop 镜像/桌面包。**

## 怎么跑

浏览器只开 **http://127.0.0.1:5201**。

```
pnpm setup          # 可选：deps + db + build
pnpm run dev        # api → web → gateway
# 排障
pnpm dev:api / dev:web / dev:gateway
pnpm verify-api     # backend build
```

| URL | 含义 |
|---|---|
| `/login` | 统一登录 |
| `/console/` | 企业控制台（默认首页） |
| `/admin` | 平台管理 |
| `/agent/*` | 废弃，网关重定向到 `/console` |

## 改代码落点

- 登录/租户/成员/计费：`apps/backend` `apps/frontend`
- 网关路由/端口：`scripts/dev-gateway.mjs`、根 `package.json` 的 `dev` / `dev:*`
- 终端能力：只动 `../mammoth-agent`（本仓库不改）

## 硬约束

- 不擅自 commit/push；本机无 `.git` 时不要 `git init`
- 检索/会话必须带 `tenant_id`（KB 做的时候）
- 版本号唯一来源 `config/version.json`：发版只跑 `pnpm version:bump`；禁止硬编码
- 角标读 `GET /api/version`
